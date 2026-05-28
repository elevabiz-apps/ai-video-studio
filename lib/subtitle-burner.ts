import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const CWD = process.cwd();
const COMPOSITOR_DIR = path.join(CWD, "node_modules", "@remotion", "compositor-darwin-arm64");
const FFMPEG_BIN = process.env.FFMPEG_PATH ?? path.join(COMPOSITOR_DIR, "ffmpeg");

/**
 * Burns subtitles into a clip using a Python script (cv2 + PIL).
 * Accepts captions as a JSON string so each project uses its own captions.
 * The clip file is replaced in-place on success.
 * Fails silently — clip without subtitles is still usable.
 */
export async function burnSubtitles(
  clipPath: string,
  clipStartMs: number,
  clipEndMs: number,
  captionsJson: string,
  offsetMs: number = 0,    // 0 = sync subtitles exactly with audio
  preset: string = "impacto_rosa"
): Promise<void> {
  if (!captionsJson) {
    console.warn("[subtitle] no captions provided, skipping");
    return;
  }

  console.log(`[subtitle] Starting burn — clip: ${path.basename(clipPath)}, preset: ${preset}, range: ${clipStartMs}–${clipEndMs}ms`);

  // Write captions to a temp file so the Python script can read them
  const tmpCaptions = path.join(os.tmpdir(), `captions_${Date.now()}.json`);
  fs.writeFileSync(tmpCaptions, captionsJson, "utf-8");

  const script = path.join(CWD, "scripts", "burn-subtitles.py");
  const ffmpegBin = FFMPEG_BIN;

  const TIMEOUT_MS = 8 * 60 * 1000; // 8 minutes — kill if ffmpeg hangs

  await new Promise<void>((resolve) => {
    const proc = spawn(
      "python3",
      [
        script,
        clipPath,
        tmpCaptions,
        String(clipStartMs),
        String(clipEndMs),
        ffmpegBin,
        COMPOSITOR_DIR,
        String(offsetMs),
        preset,
      ],
      {
        cwd: CWD,
        env: { ...process.env, DYLD_LIBRARY_PATH: COMPOSITOR_DIR },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    const timeoutId = setTimeout(() => {
      console.warn("[subtitle] burn-subtitles.py timed out — killing process");
      proc.kill("SIGKILL");
      resolve();
    }, TIMEOUT_MS);

    // DO NOT use process.stdout.write / process.stderr.write — they are
    // SYNCHRONOUS/BLOCKING in Node.js when stdio is a pipe (e.g. on Railway).
    // Piping every ffmpeg progress line blocks the event loop, which stops the
    // pipe from being drained, which blocks Python/ffmpeg → permanent deadlock.
    // Only log our own diagnostic lines from the Python script.
    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      for (const line of text.split("\n")) {
        if (line.startsWith("[subtitles]")) console.log(line);
      }
    };
    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);

    proc.on("close", (code) => {
      clearTimeout(timeoutId);
      try { fs.unlinkSync(tmpCaptions); } catch { /* ignore */ }
      if (code === 0) {
        console.log(`[subtitle] ✓ Done — ${path.basename(clipPath)}`);
      } else {
        console.warn(`[subtitle] burn-subtitles.py exited with code ${code} — clip saved without subtitles`);
      }
      resolve(); // non-fatal: always resolve
    });

    proc.on("error", (err) => {
      clearTimeout(timeoutId);
      try { fs.unlinkSync(tmpCaptions); } catch { /* ignore */ }
      console.warn("[subtitle] Failed to spawn burn-subtitles.py:", err.message);
      resolve();
    });
  });
}
