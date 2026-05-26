#!/usr/bin/env npx tsx
/**
 * Extract audio from video as 16kHz WAV for Whisper transcription.
 * Usage: npx tsx scripts/extract-audio.ts public/assets/video.mp4
 * Output: public/assets/audio.wav
 */
import {spawnSync} from "child_process";
import path from "path";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: npx tsx scripts/extract-audio.ts <video-path>");
  process.exit(1);
}

const outputPath = path.join("public", "assets", "audio.wav");

// Use FFMPEG_PATH env var (set on Railway) or fall back to the bundled macOS binary for local dev
const compositorDir = path.join(process.cwd(), "node_modules", "@remotion", "compositor-darwin-arm64");
const ffmpegBin = process.env.FFMPEG_PATH ?? path.join(compositorDir, "ffmpeg");
const spawnEnv = process.env.FFMPEG_PATH
  ? process.env
  : { ...process.env, DYLD_LIBRARY_PATH: compositorDir };

console.log(`Extracting audio from: ${inputPath}`);
console.log(`Output: ${outputPath}`);

const result = spawnSync(ffmpegBin, ["-i", inputPath, "-ar", "16000", "-ac", "1", "-y", outputPath], {
  stdio: "inherit",
  env: spawnEnv,
});

if (result.status !== 0) {
  console.error("Failed to extract audio. Is the video file valid?");
  process.exit(1);
}

console.log("\nAudio extracted successfully (16kHz mono WAV)");
