import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import {
  getProjectById,
  updateProjectField,
  updateJobStatus,
  setJobResult,
  createClip,
  updateClipName,
  updateClipSortOrder,
  updateClipHookPhrase,
  updateClipScore,
  updateClipOutputPath,
  deleteClipsByProject,
} from "./db-async";
import { segmentCaptions } from "./clip-segmenter";
import { smartClipVideo } from "./smart-clipper";
import { burnSubtitles } from "./subtitle-burner";
import { isSupabasePath, fromDbPath, downloadToBuffer } from "./storage";

const CWD = process.cwd();
// FFMPEG_PATH env var overrides the bundled macOS binary (used on Railway/Linux)
const COMPOSITOR_DIR = path.join(CWD, "node_modules", "@remotion", "compositor-darwin-arm64");
const FFMPEG_BIN = process.env.FFMPEG_PATH ?? path.join(COMPOSITOR_DIR, "ffmpeg");

function runScript(
  scriptPath: string,
  args: string[],
  onOutput?: (line: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("npx", ["tsx", scriptPath, ...args], {
      cwd: CWD,
      env: { ...process.env, DYLD_LIBRARY_PATH: COMPOSITOR_DIR },
      stdio: ["ignore", "pipe", "pipe"],
    });

    proc.stdout.on("data", (chunk: Buffer) => {
      chunk.toString().split("\n").filter(Boolean).forEach((l) => onOutput?.(l));
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      chunk.toString().split("\n").filter(Boolean).forEach((l) => onOutput?.(l));
    });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Script ${path.basename(scriptPath)} exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}

/** Cut silences from video using the existing Python script */
function cutSilences(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(CWD, "scripts", "cut_silences.py");
    const proc = spawn("python3", [scriptPath, inputPath, outputPath], {
      cwd: CWD,
      env: { ...process.env, DYLD_LIBRARY_PATH: COMPOSITOR_DIR },
      stdio: ["ignore", "pipe", "pipe"],
    });
    proc.stdout.on("data", (chunk: Buffer) => process.stdout.write(chunk));
    proc.stderr.on("data", (chunk: Buffer) => process.stderr.write(chunk));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`cut_silences.py exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared base pipeline (steps 1-6): analyze → silence → cut → audio → transcribe → save
// ─────────────────────────────────────────────────────────────────────────────

async function runBasePipeline(
  jobId: string,
  projectId: string,
  sourceVideoRelative: string,
  updateJob: (
    status: "processing" | "complete" | "failed",
    progress: number,
    step: string,
    error?: string
  ) => Promise<void>
): Promise<{ captionsJson: string | null; processedVideoPath: string }> {
  // Always use the original video — save it on first run and reuse it on re-runs.
  // This prevents re-processing an already-processed file (which creates _procesado_procesado_... chains).
  const project = await getProjectById(projectId);
  const assetsDir = path.join(CWD, "public", "assets");
  const publicDir = path.join(CWD, "public");

  // ── Download from Supabase Storage if needed ──────────────────────────────
  // When source_video is a "supabase:..." path, download it to local disk first.
  let resolvedSourceRelative = sourceVideoRelative;
  if (isSupabasePath(sourceVideoRelative)) {
    await updateJob("processing", 2, "Descargando video...");
    const storagePath = fromDbPath(sourceVideoRelative);
    const filename = path.basename(storagePath);
    const localPath = path.join(assetsDir, filename);
    if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
    if (!fs.existsSync(localPath)) {
      const buffer = await downloadToBuffer(storagePath);
      fs.writeFileSync(localPath, buffer);
    }
    resolvedSourceRelative = `assets/${filename}`;
    await updateProjectField(projectId, { source_video: resolvedSourceRelative });
  }
  sourceVideoRelative = resolvedSourceRelative;

  if (!project?.original_video) {
    await updateProjectField(projectId, { original_video: sourceVideoRelative });
  }
  const originalRelative = project?.original_video
    ? (isSupabasePath(project.original_video) ? sourceVideoRelative : project.original_video)
    : sourceVideoRelative;
  const videoPath = path.join(CWD, "public", originalRelative);

  // Step 1: Analyze original video
  await updateJob("processing", 5, "Analizando video...");
  await runScript("scripts/analyze-video.ts", [videoPath]);

  // Step 2: Detect silence in original video
  await updateJob("processing", 18, "Detectando silencios...");
  await runScript("scripts/detect-silence.ts", [videoPath]);

  // Step 3: Cut silences → produce a processed video
  await updateJob("processing", 32, "Cortando silencios...");
  const ext = path.extname(sourceVideoRelative);
  const baseName = path.basename(sourceVideoRelative, ext);
  const processedFileName = `${baseName}_procesado.mp4`;
  const processedVideoPath = path.join(assetsDir, processedFileName);
  const processedVideoRelative = `assets/${processedFileName}`;

  await cutSilences(videoPath, processedVideoPath);
  await updateProjectField(projectId, { source_video: processedVideoRelative });

  // Step 4: Extract audio from the PROCESSED video (ensures sync with what's displayed)
  await updateJob("processing", 50, "Extrayendo audio...");
  await runScript("scripts/extract-audio.ts", [processedVideoPath]);

  // Step 5: Transcribe
  await updateJob("processing", 65, "Transcribiendo con Whisper...");
  const audioPath = path.join(assetsDir, "audio.wav");
  await runScript("scripts/transcribe.ts", [audioPath]);

  // Step 6: Save results to DB
  await updateJob("processing", 85, "Guardando resultados...");

  const captionsPath = path.join(publicDir, "captions.json");
  const metadataPath = path.join(publicDir, "video-metadata.json");
  const silencePath = path.join(publicDir, "silence.json");

  let captionsJson: string | null = null;
  let durationSeconds: number | null = null;

  if (fs.existsSync(captionsPath)) {
    captionsJson = fs.readFileSync(captionsPath, "utf-8");
  }
  if (fs.existsSync(metadataPath)) {
    try {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
      durationSeconds = metadata.duration || null;
    } catch (e) {
      console.warn("[pipeline] Failed to parse video-metadata.json:", e);
    }
  }

  const processedSilence = fs.existsSync(silencePath)
    ? fs.readFileSync(silencePath, "utf-8")
    : null;

  await updateProjectField(projectId, {
    captions: captionsJson,
    silence_data: processedSilence,
    duration_seconds: durationSeconds,
  });

  return { captionsJson, processedVideoPath };
}

// ─────────────────────────────────────────────────────────────────────────────
// Single-video pipeline (original behavior)
// ─────────────────────────────────────────────────────────────────────────────

export async function spawnPipeline(
  jobId: string,
  projectId: string,
  sourceVideoRelative: string
): Promise<void> {
  async function updateJob(
    status: "processing" | "complete" | "failed",
    progress: number,
    step: string,
    error?: string
  ) {
    await updateJobStatus(jobId, status, progress, step, error ?? null);
  }

  try {
    const { captionsJson } = await runBasePipeline(
      jobId,
      projectId,
      sourceVideoRelative,
      updateJob
    );

    await updateProjectField(projectId, { status: "ready" });
    await setJobResult(jobId, JSON.stringify({ hasCaptions: !!captionsJson }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateJob("failed", 0, "Error", message);
    await updateProjectField(projectId, { status: "draft" });
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-clip pipeline: base steps + segment clips + ffmpeg cut each clip
// (AI scoring is a separate optional step added later)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the Python face-detection script on the video.
 * Returns { cropX, cropW } derived from the detected face center.
 * Falls back to centered crop if detection fails.
 */
async function detectFaceCenter(
  videoPath: string
): Promise<{ cropX: number; cropW: number } | null> {
  return new Promise((resolve) => {
    const ffmpegBin = FFMPEG_BIN;
    const scriptPath = path.join(CWD, "scripts", "detect-face-center.py");

    const proc = spawn(
      "python3",
      [scriptPath, videoPath, ffmpegBin, COMPOSITOR_DIR],
      {
        cwd: CWD,
        env: { ...process.env, DYLD_LIBRARY_PATH: COMPOSITOR_DIR },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    let stdout = "";
    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk: Buffer) => { process.stderr.write(chunk); });

    proc.on("close", (code) => {
      try {
        // Find last JSON line in stdout (mediapipe logs may precede it)
        const jsonLine = stdout.trim().split("\n").filter((l) => l.trim().startsWith("{")).pop();
        if (!jsonLine) throw new Error("No JSON output");
        const result = JSON.parse(jsonLine);
        resolve({ cropX: result.crop_x, cropW: result.crop_w });
      } catch {
        console.warn(`[face-detect] Failed to parse output (code ${code}), using centered crop`);
        resolve(null);
      }
    });

    proc.on("error", () => resolve(null));
  });
}

/**
 * Re-encode a horizontal video to vertical (9:16) using a face-aware crop.
 * cropX and cropW come from face detection; falls back to centered crop.
 */
function reframeToVertical(
  inputPath: string,
  outputPath: string,
  cropX?: number,
  cropW?: number
): Promise<void> {
  // If we have face detection data, use exact pixel values; otherwise center mathematically
  const cropFilter = (cropX !== undefined && cropW !== undefined)
    ? `crop=${cropW}:ih:${cropX}:0,scale=1080:1920`
    : "crop=trunc(ih*9/16/2)*2:ih:(iw-trunc(ih*9/16/2)*2)/2:0,scale=1080:1920";

  return new Promise((resolve, reject) => {
    const ffmpegBin = FFMPEG_BIN;
    const proc = spawn(
      ffmpegBin,
      [
        "-i", inputPath,
        "-vf", cropFilter,
        "-c:v", "libx264",
        "-crf", "22",
        "-preset", "veryfast",
        "-c:a", "copy",
        "-y",
        outputPath,
      ],
      {
        cwd: CWD,
        env: { ...process.env, DYLD_LIBRARY_PATH: COMPOSITOR_DIR },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    proc.stdout.on("data", (chunk: Buffer) => process.stdout.write(chunk));
    proc.stderr.on("data", (chunk: Buffer) => process.stderr.write(chunk));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`reframe ffmpeg exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}

/** Cut a segment from a video file using ffmpeg (stream copy — fast, lossless) */
function cutClip(
  inputPath: string,
  outputPath: string,
  startSeconds: number,
  endSeconds: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpegBin = FFMPEG_BIN;
    const proc = spawn(
      ffmpegBin,
      [
        // Input seeking (fast) + re-encode video for frame-accurate cut
        // -c copy would start at a keyframe, causing audio/subtitle desync
        "-ss", String(startSeconds),
        "-to", String(endSeconds),
        "-i", inputPath,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
        "-c:a", "aac", "-b:a", "128k",
        "-y",
        outputPath,
      ],
      {
        cwd: CWD,
        env: { ...process.env, DYLD_LIBRARY_PATH: COMPOSITOR_DIR },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg cut exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}

export async function spawnMultiClipPipeline(
  jobId: string,
  projectId: string,
  sourceVideoRelative: string
): Promise<void> {
  async function updateJob(
    status: "processing" | "complete" | "failed",
    progress: number,
    step: string,
    error?: string
  ) {
    await updateJobStatus(jobId, status, progress, step, error ?? null);
  }

  try {
    // Steps 1-6: silence removal + transcription (shared with single pipeline)
    const { captionsJson, processedVideoPath } = await runBasePipeline(
      jobId,
      projectId,
      sourceVideoRelative,
      updateJob
    );

    if (!captionsJson) {
      throw new Error("No se generaron subtítulos — no se pueden segmentar clips.");
    }

    // Step 7: Re-encuadrar a vertical si el video es horizontal
    const metadataPath = path.join(CWD, "public", "video-metadata.json");
    let metadata: { width?: number; height?: number; duration?: number } | null = null;
    if (fs.existsSync(metadataPath)) {
      try { metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8")); }
      catch { console.warn("[pipeline] Failed to parse video-metadata.json"); }
    }

    const isHorizontal = metadata && (metadata.width ?? 0) > (metadata.height ?? 0);
    let finalVideoPath = processedVideoPath;

    if (isHorizontal) {
      // Detect face position before reframing
      await updateJob("processing", 86, "Detectando posición del rostro...");
      const faceResult = await detectFaceCenter(processedVideoPath);

      if (faceResult?.cropX !== undefined) {
        await updateJob("processing", 87, "Reencuadrando a vertical centrado en rostro...");
      } else {
        await updateJob("processing", 87, "Reencuadrando a vertical (9:16)...");
      }

      const verticalFileName =
        path.basename(processedVideoPath, ".mp4") + "_vertical.mp4";
      const verticalAbsPath = path.join(CWD, "public", "assets", verticalFileName);
      const verticalRelPath = `assets/${verticalFileName}`;

      await reframeToVertical(
        processedVideoPath,
        verticalAbsPath,
        faceResult?.cropX,
        faceResult?.cropW
      );

      finalVideoPath = verticalAbsPath;
      await updateProjectField(projectId, { source_video: verticalRelPath });
    }

    // Step 8: Identify clip boundaries — smart (Claude) or fallback (pauses)
    let hasApiKey = !!process.env.ANTHROPIC_API_KEY?.trim();
    if (!hasApiKey) {
      try {
        const envContent = fs.readFileSync(path.join(CWD, ".env.local"), "utf-8");
        const match = envContent.match(/^ANTHROPIC_API_KEY=(.+)$/m);
        hasApiKey = !!(match?.[1]?.trim());
      } catch { /* ignore */ }
    }
    console.log(`[pipeline] ANTHROPIC_API_KEY available: ${hasApiKey}`);

    let segments: { startMs: number; endMs: number; hook?: string; reason?: string; score?: number }[] = [];

    if (hasApiKey) {
      await updateJob("processing", 89, "Analizando contenido con IA...");
      try {
        const captions = JSON.parse(captionsJson);
        const smartClips = await smartClipVideo(captions);
        if (smartClips.length > 0) {
          const sorted = [...smartClips].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
          segments = sorted.map((c) => ({
            startMs: c.start_ms,
            endMs: c.end_ms,
            hook: c.hook,
            reason: c.reason,
            score: c.score,
          }));
          console.log(`[pipeline] Smart clipper found ${segments.length} clips, scores: ${segments.map(s => s.score).join(', ')}`);
        } else {
          console.warn("[pipeline] Smart clipper returned 0 clips, falling back to pause-based");
        }
      } catch (aiErr) {
        console.warn("[pipeline] Smart clipper failed, falling back:", aiErr);
      }
    }

    // Fallback: pause-based segmentation
    if (segments.length === 0) {
      await updateJob("processing", 89, "Segmentando clips...");
      try {
        const captions = JSON.parse(captionsJson);
        const paused = segmentCaptions(captions);
        segments = paused.length > 0
          ? paused
          : [{ startMs: captions[0]?.startMs ?? 0, endMs: captions[captions.length - 1]?.endMs ?? 0 }];
      } catch (err) {
        console.warn("[pipeline] segmentCaptions failed:", err);
        segments = [];
      }
    }

    await deleteClipsByProject(projectId); // clear clips from any previous run

    // Step 9: Cut each clip from the (possibly reframed) processed video
    const finalBaseName = path.basename(finalVideoPath, ".mp4");
    const assetsDir = path.join(CWD, "public", "assets");

    for (let i = 0; i < segments.length; i++) {
      const progressPct = 92 + Math.round(((i + 1) / segments.length) * 7);
      await updateJob("processing", progressPct, `Cortando clip ${i + 1} de ${segments.length}...`);

      const clipId = randomUUID();
      const startSec = segments[i].startMs / 1000;
      const endSec = segments[i].endMs / 1000;
      const hook = segments[i].hook;
      const reason = segments[i].reason;

      // Register clip in DB
      await createClip(clipId, projectId, startSec, endSec);
      await updateClipName(clipId, hook ?? `Clip ${i + 1}`);
      await updateClipSortOrder(clipId, i);
      if (hook) await updateClipHookPhrase(clipId, hook);
      const clipScore = segments[i].score ?? 0;
      if (reason || segments[i].score !== undefined) {
        await updateClipScore(clipId, clipScore, reason ?? "");
      }

      // Cut physical file from the final (vertical) video
      const clipFileName = `${finalBaseName}_clip${String(i + 1).padStart(2, "0")}.mp4`;
      const clipAbsPath = path.join(assetsDir, clipFileName);
      const clipRelPath = `assets/${clipFileName}`;

      try {
        await cutClip(finalVideoPath, clipAbsPath, startSec, endSec);
        await updateClipOutputPath(clipId, clipRelPath);

        // Burn subtitles (non-fatal — replaces clip in-place on success)
        if (captionsJson) {
          await burnSubtitles(clipAbsPath, segments[i].startMs, segments[i].endMs, captionsJson);
        }
      } catch (cutErr) {
        console.warn(`Could not cut clip ${i + 1}:`, cutErr);
      }
    }

    await updateProjectField(projectId, { status: "ready" });
    await setJobResult(jobId, JSON.stringify({ hasCaptions: true, clipCount: segments.length }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateJob("failed", 0, "Error", message);
    await updateProjectField(projectId, { status: "draft" });
    throw err;
  }
}
