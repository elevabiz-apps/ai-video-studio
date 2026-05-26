#!/usr/bin/env npx tsx
/**
 * Transcribe audio using Groq's Whisper API (no local compilation needed).
 * Usage: npx tsx scripts/transcribe.ts [audio-path]
 * Default audio: public/assets/audio.wav
 * Output: public/captions.json
 *
 * Requires GROQ_API_KEY env var. Free tier: 2h audio/day.
 * Get a free key at: https://console.groq.com
 */
import path from "path";
import { writeFileSync, existsSync, readFileSync } from "fs";

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

async function main() {
  console.log(`Transcribing: ${inputPath}`);
  console.log(`Using Groq Whisper API (whisper-large-v3-turbo)...`);

  const audioBuffer = readFileSync(inputPath);
  const blob = new Blob([audioBuffer], { type: "audio/wav" });

  const formData = new FormData();
  formData.append("file", blob, path.basename(inputPath));
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
    console.error(`Groq API error ${response.status}: ${errText}`);
    process.exit(1);
  }

  const result = await response.json() as {
    text: string;
    words?: GroqWord[];
    segments?: GroqSegment[];
  };

  let captions: Caption[] = [];

  if (result.words && result.words.length > 0) {
    // Word-level timestamps (preferred — matches karaoke subtitle behavior)
    captions = result.words.map((w) => ({
      text: w.word,
      startMs: Math.round(w.start * 1000),
      endMs: Math.round(w.end * 1000),
    }));
  } else if (result.segments && result.segments.length > 0) {
    // Fallback: segment-level (e.g. if word timestamps unavailable)
    captions = result.segments.map((s) => ({
      text: s.text,
      startMs: Math.round(s.start * 1000),
      endMs: Math.round(s.end * 1000),
    }));
  } else {
    // Last resort: whole transcript as one caption
    captions = [{ text: result.text, startMs: 0, endMs: 0 }];
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
