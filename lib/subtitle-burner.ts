import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const CWD = process.cwd();
const COMPOSITOR_DIR = path.join(CWD, "node_modules", "@remotion", "compositor-darwin-arm64");

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
  preset: string = "bold"  // bold | classic | outline | glow | box
): Promise<void> {
  if (!captionsJson) {
    console.warn("[subtitle] no captions provided, skipping");
    return;
  }

  // Write captions to a temp file so the Python script can read them
  const tmpCaptions = path.join(os.tmpdir(), `captions_${Date.now()}.json`);
  fs.writeFileSync(tmpCaptions, captionsJson, "utf-8");

  const script = path.join(CWD, "scripts", "burn-subtitles.py");
  const ffmpegBin = path.join(COMPOSITOR_DIR, "ffmpeg");

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

    proc.stdout.on("data", (b: Buffer) => process.stdout.write(b));
    proc.stderr.on("data", (b: Buffer) => process.stderr.write(b));

    proc.on("close", (code) => {
      // Clean up temp captions file
      try { fs.unlinkSync(tmpCaptions); } catch { /* ignore */ }
      if (code !== 0) {
        console.warn(`[subtitle] burn-subtitles.py exited with code ${code} — clip saved without subtitles`);
      }
      resolve(); // non-fatal: always resolve
    });

    proc.on("error", (err) => {
      try { fs.unlinkSync(tmpCaptions); } catch { /* ignore */ }
      console.warn("[subtitle] Failed to spawn burn-subtitles.py:", err.message);
      resolve();
    });
  });
}
