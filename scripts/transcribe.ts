#!/usr/bin/env npx tsx
/**
 * Transcribe audio using Groq's Whisper API (no local compilation needed).
 * Usage: npx tsx scripts/transcribe.ts [audio-path]
 * Default audio: public/assets/audio.wav
 * Output: public/captions.json
 *
 * Requires GROQ_API_KEY env var. Free tier: 2h audio/day.
 * Get a free key at: https://console.groq.com
 *
 * LARGE / LONG VIDEOS: Groq's Whisper endpoint rejects files over its size
 * limit (~25MB free tier, ~100MB dev). The extracted audio is 16kHz mono WAV
 * (~1.9 MB/min), so a video longer than ~14 min would fail with a 413. To keep
 * long videos (the whole point of multi-clip) from breaking, when the audio is
 * over a safe threshold we split it into fixed-duration chunks with ffmpeg,
 * transcribe each, and re-base each chunk's word timestamps by its position in
 * the timeline. Chunking does NOT consume extra audio minutes — it's the same
 * audio split across calls — so it stays within the free-tier 2h/day budget.
 */
import path from "path";
import { writeFileSync, existsSync, readFileSync, mkdirSync, rmSync, statSync } from "fs";
import { spawnSync } from "child_process";

const inputPath = process.argv[2] || path.join("public", "assets", "audio.wav");
const outputPath = path.join("public", "captions.json");

if (!existsSync(inputPath)) {
  console.error(`Audio file not found: ${inputPath}`);
  console.error("Run extract-audio.ts first.");
  process.exit(1);
}

const GROQ_API_KEY = process.env.GROQ_API_KEY;
if (!GROQ_API_KEY) {
  console.error("GROQ_API_KEY env var is not set.");
  console.error("Get a free key at https://console.groq.com and add it to Railway Variables.");
  process.exit(1);
}

type GroqWord = { word: string; start: number; end: number };
type GroqSegment = { text: string; start: number; end: number };
type Caption = { text: string; startMs: number; endMs: number };

// ── Chunking config ───────────────────────────────────────────────────────────
// Files at or below this size go straight to Groq in one request (the common
// case — short clips). Above it, we split. 20MB keeps us safely under the
// 25MB free-tier ceiling for the single-shot path.
// Overridable via env so the chunk size can be tuned if Groq's tier/limit
// changes (and so the chunked path can be exercised on small test audio).
const SAFE_SINGLE_BYTES = Number(process.env.TRANSCRIBE_MAX_SINGLE_BYTES) || 20 * 1024 * 1024;
// Each chunk is this many seconds. extract-audio.ts produces 16kHz mono 16-bit
// PCM = 32,000 bytes/s, so 540s ≈ 17.3MB per chunk — safely under 25MB and
// leaving headroom even if ffmpeg writes a slightly larger header.
const CHUNK_SECONDS = Number(process.env.TRANSCRIBE_CHUNK_SECONDS) || 540;

// ffmpeg binary resolution mirrors extract-audio.ts: FFMPEG_PATH on Railway,
// the bundled Remotion macOS binary for local dev.
const compositorDir = path.join(process.cwd(), "node_modules", "@remotion", "compositor-darwin-arm64");
const ffmpegBin = process.env.FFMPEG_PATH ?? path.join(compositorDir, "ffmpeg");
const ffmpegEnv = process.env.FFMPEG_PATH
  ? process.env
  : { ...process.env, DYLD_LIBRARY_PATH: compositorDir };

/** Transcribe ONE audio file. Returns word-level captions relative to that
 *  file's own start (0ms = beginning of the file). */
async function transcribeFile(filePath: string): Promise<Caption[]> {
  const audioBuffer = readFileSync(filePath);
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: "audio/wav" });

  const formData = new FormData();
  formData.append("file", blob, path.basename(filePath));
  formData.append("model", "whisper-large-v3-turbo");
  formData.append("language", "es");
  formData.append("response_format", "verbose_json");
  formData.append("timestamp_granularities[]", "word");

  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API error ${response.status}: ${errText}`);
  }

  const result = (await response.json()) as {
    text: string;
    words?: GroqWord[];
    segments?: GroqSegment[];
  };

  if (result.words && result.words.length > 0) {
    return result.words.map((w) => ({
      text: w.word,
      startMs: Math.round(w.start * 1000),
      endMs: Math.round(w.end * 1000),
    }));
  }
  if (result.segments && result.segments.length > 0) {
    return result.segments.map((s) => ({
      text: s.text,
      startMs: Math.round(s.start * 1000),
      endMs: Math.round(s.end * 1000),
    }));
  }
  // Last resort: whole transcript as one caption (no timestamps).
  return [{ text: result.text, startMs: 0, endMs: 0 }];
}

// extract-audio.ts writes 16kHz mono 16-bit PCM = 32,000 bytes/s. Used to
// derive duration from file size without an ffprobe dependency (the bundled
// Remotion ffmpeg is stripped — no ffprobe, no segment muxer).
const WAV_BYTES_PER_SEC = 16000 * 1 * 2;
const WAV_HEADER_BYTES = 44;

/** Split a WAV into fixed-duration chunks. Each chunk is extracted with a
 *  separate `-ss`/`-t -c copy` call — basic options every ffmpeg build supports
 *  (the stripped Remotion binary has no `segment` muxer). Each chunk's audio
 *  starts at 0, so word times come back relative to the chunk; the caller adds
 *  the nominal `i * CHUNK_SECONDS` offset. Returns chunk paths in order. */
function splitIntoChunks(filePath: string, chunkDir: string): string[] {
  if (existsSync(chunkDir)) rmSync(chunkDir, { recursive: true, force: true });
  mkdirSync(chunkDir, { recursive: true });

  const totalSec = (statSync(filePath).size - WAV_HEADER_BYTES) / WAV_BYTES_PER_SEC;
  const nChunks = Math.max(1, Math.ceil(totalSec / CHUNK_SECONDS));
  const paths: string[] = [];

  for (let i = 0; i < nChunks; i++) {
    const startSec = i * CHUNK_SECONDS;
    if (startSec >= totalSec) break;
    const chunkPath = path.join(chunkDir, `chunk${String(i).padStart(3, "0")}.wav`);
    const res = spawnSync(
      ffmpegBin,
      [
        "-ss", String(startSec),
        "-i", filePath,
        "-t", String(CHUNK_SECONDS),
        "-c", "copy",
        "-y", chunkPath,
      ],
      { stdio: "inherit", env: ffmpegEnv }
    );
    if (res.status !== 0 || !existsSync(chunkPath)) {
      throw new Error(`ffmpeg failed to extract audio chunk ${i}`);
    }
    paths.push(chunkPath);
  }

  return paths;
}

async function main() {
  console.log(`Transcribing: ${inputPath}`);
  console.log(`Using Groq Whisper API (whisper-large-v3-turbo)...`);

  const size = statSync(inputPath).size;
  let captions: Caption[] = [];

  if (size <= SAFE_SINGLE_BYTES) {
    // Short audio → single request (the common path).
    captions = await transcribeFile(inputPath);
  } else {
    // Long audio → split, transcribe each chunk, offset timestamps. Each full
    // chunk is exactly CHUNK_SECONDS long (segment muxer cuts at that boundary
    // for constant-bitrate PCM), so chunk i starts at i * CHUNK_SECONDS.
    const sizeMb = (size / (1024 * 1024)).toFixed(1);
    console.log(`Audio is ${sizeMb}MB (> ${SAFE_SINGLE_BYTES / (1024 * 1024)}MB) — splitting into ${CHUNK_SECONDS}s chunks for Groq.`);
    const chunkDir = path.join(path.dirname(inputPath), ".audio-chunks");
    const chunks = splitIntoChunks(inputPath, chunkDir);
    console.log(`  ${chunks.length} chunks`);

    try {
      for (let i = 0; i < chunks.length; i++) {
        const offsetMs = i * CHUNK_SECONDS * 1000;
        console.log(`  Transcribing chunk ${i + 1}/${chunks.length} (offset ${Math.round(offsetMs / 1000)}s)...`);
        const chunkCaps = await transcribeFile(chunks[i]);
        for (const c of chunkCaps) {
          captions.push({
            text: c.text,
            startMs: c.startMs + offsetMs,
            endMs: c.endMs + offsetMs,
          });
        }
      }
    } finally {
      rmSync(chunkDir, { recursive: true, force: true });
    }
  }

  writeFileSync(outputPath, JSON.stringify(captions, null, 2));
  console.log(`\nCaptions saved to ${outputPath}`);
  console.log(`  ${captions.length} caption segments`);
  if (captions.length > 0) {
    console.log(`  First: "${captions[0].text.trim()}" (${captions[0].startMs}ms)`);
    const last = captions[captions.length - 1];
    console.log(`  Last: "${last.text.trim()}" (${last.endMs}ms)`);
  }
}

main().catch((err) => {
  console.error("Transcription failed:", err.message ?? err);
  process.exit(1);
});
