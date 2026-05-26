import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import type { Project, Clip } from "./db";
import { updateRender as updateRenderDb } from "./db-async";

const CWD = process.cwd();
// FFMPEG_PATH env var overrides the bundled macOS binary (used on Railway/Linux)
const COMPOSITOR_DIR = path.join(CWD, "node_modules", "@remotion", "compositor-darwin-arm64");
const FFMPEG_BIN = process.env.FFMPEG_PATH ?? path.join(COMPOSITOR_DIR, "ffmpeg");
const BURN_SCRIPT = path.join(CWD, "scripts", "burn-subtitles.py");

async function updateRender(
  renderId: string,
  status: string,
  progress: number,
  outputPath?: string,
  error?: string
) {
  await updateRenderDb(renderId, status, progress, outputPath ?? null);
}

/**
 * Render a single-video project by burning subtitles with Python + cv2 + PIL.
 * Much faster than Remotion: no Chrome, no frame-by-frame React rendering.
 *
 * Pipeline:
 *  1. Copy the processed video to renders/ (or re-frame if horizontal)
 *  2. Burn captions with burn-subtitles.py (replaces file in-place)
 */
export async function spawnRender(
  renderId: string,
  project: Project,
  platform: string,
  captionPreset: string,
  clip?: Clip
): Promise<void> {
  const clipSuffix = clip ? `_clip${Math.round(clip.start_seconds)}s` : "";
  const timestamp = new Date()
    .toISOString()
    .replace(/[T:.Z]/g, "-")
    .slice(0, 19);
  const outputFileName = `render_${platform}${clipSuffix}_${timestamp}.mp4`;
  const rendersDir = path.join(CWD, "public", "renders");
  const outputAbsPath = path.join(rendersDir, outputFileName);
  const outputRelative = `renders/${outputFileName}`;

  if (!fs.existsSync(rendersDir)) {
    fs.mkdirSync(rendersDir, { recursive: true });
  }

  await updateRender(renderId, "rendering", 5);

  try {
    // ── 1. Resolve source video ─────────────────────────────────────────────
    if (!project.source_video) throw new Error("No source video on project");
    const sourceAbs = path.join(CWD, "public", project.source_video);

    // ── 2. Copy source → output location ───────────────────────────────────
    await updateRender(renderId, "rendering", 10);
    await runFfmpegCopy(sourceAbs, outputAbsPath);
    await updateRender(renderId, "rendering", 20);

    // ── 3. Burn subtitles if captions exist ─────────────────────────────────
    if (project.captions) {
      const tmpCaptions = path.join(os.tmpdir(), `captions_render_${renderId}.json`);
      fs.writeFileSync(tmpCaptions, project.captions, "utf-8");

      const duration = project.duration_seconds ?? 0;
      const startMs = clip ? clip.start_seconds * 1000 : 0;
      const endMs   = clip ? clip.end_seconds   * 1000 : duration * 1000;

      await runSubtitleBurn(
        outputAbsPath,
        tmpCaptions,
        startMs,
        endMs,
        captionPreset,
        async (pct) => await updateRender(renderId, "rendering", 20 + Math.round(pct * 0.75))
      );

      try { fs.unlinkSync(tmpCaptions); } catch { /* ignore */ }
    }

    // ── 4. Done ─────────────────────────────────────────────────────────────
    if (fs.existsSync(outputAbsPath)) {
      await updateRender(renderId, "complete", 100, outputRelative);
    } else {
      throw new Error("Output file not found after render");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateRender(renderId, "failed", 0, undefined, msg);
    throw err;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function runFfmpegCopy(input: string, output: string): Promise<void> {
  // Simple file copy — no transcoding needed, avoids macOS SIP stripping DYLD_LIBRARY_PATH
  try {
    fs.copyFileSync(input, output);
    return Promise.resolve();
  } catch (err) {
    return Promise.reject(err);
  }
}

function runSubtitleBurn(
  clipPath: string,
  captionsPath: string,
  startMs: number,
  endMs: number,
  captionPreset: string,
  onProgress: (pct: number) => void | Promise<void>
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "python3",
      [
        BURN_SCRIPT,
        clipPath,
        captionsPath,
        String(startMs),
        String(endMs),
        FFMPEG_BIN,
        COMPOSITOR_DIR,
        "0",    // offset_ms: 0 = no delay, subtitles sync exactly with audio
        captionPreset,  // preset: bold | classic | outline | glow | box
      ],
      {
        cwd: CWD,
        env: { ...process.env, DYLD_LIBRARY_PATH: COMPOSITOR_DIR },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    // Parse progress from the Python script output
    let totalFrames = 0;
    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      process.stderr.write(text);

      // "843 frames" from header line → set total
      const totalMatch = text.match(/·\s*(\d+)\s+frames/);
      if (totalMatch) totalFrames = parseInt(totalMatch[1], 10);

      // "  200/843" frame progress
      const progressMatch = text.match(/^\s+(\d+)\/(\d+)/m);
      if (progressMatch) {
        const done  = parseInt(progressMatch[1], 10);
        const total = parseInt(progressMatch[2], 10);
        if (total > 0) onProgress(Math.min(done / total, 0.92));
      }

      // ffmpeg encode progress: "time=00:00:30" out of total duration
      const timeMatch = text.match(/time=(\d+):(\d+):(\d+)/);
      if (timeMatch && totalFrames > 0) {
        const secs = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]);
        // Assume 30fps to estimate progress during final encode (92%→99%)
        const encodePct = Math.min(secs / (totalFrames / 30), 1);
        onProgress(0.92 + encodePct * 0.07);
      }
    };

    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);

    proc.on("close", (code) => {
      if (code === 0) {
        onProgress(1);
        resolve();
      } else {
        reject(new Error(`burn-subtitles.py exited with code ${code}`));
      }
    });
    proc.on("error", reject);
  });
}
