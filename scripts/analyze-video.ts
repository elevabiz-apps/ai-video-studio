#!/usr/bin/env npx tsx
/**
 * Analyze a video file and extract metadata.
 * Usage: npx tsx scripts/analyze-video.ts public/assets/video.mp4
 * Output: public/video-metadata.json
 */
import {spawnSync} from "child_process";
import {writeFileSync} from "fs";
import path from "path";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: npx tsx scripts/analyze-video.ts <video-path>");
  process.exit(1);
}

console.log(`Analyzing: ${inputPath}`);

// Use spawnSync (no shell) so DYLD_LIBRARY_PATH reaches the binary on macOS
const compositorDir = path.join(process.cwd(), "node_modules", "@remotion", "compositor-darwin-arm64");
const ffprobeBin = path.join(compositorDir, "ffprobe");
const result = spawnSync(ffprobeBin, [
  "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", inputPath
], {
  encoding: "utf-8",
  env: { ...process.env, DYLD_LIBRARY_PATH: compositorDir },
});

if (result.error || result.status !== 0) {
  console.error("ffprobe failed:", result.stderr || result.error?.message);
  process.exit(1);
}

const output = result.stdout;
const probe = JSON.parse(output);

const videoStream = probe.streams?.find((s: any) => s.codec_type === "video");
const audioStream = probe.streams?.find((s: any) => s.codec_type === "audio");

const metadata = {
  duration: parseFloat(probe.format?.duration || "0"),
  width: videoStream?.width || 0,
  height: videoStream?.height || 0,
  fps: videoStream?.r_frame_rate
    ? eval(videoStream.r_frame_rate)
    : 30,
  videoCodec: videoStream?.codec_name || "unknown",
  audioCodec: audioStream?.codec_name || "none",
  bitrate: parseInt(probe.format?.bit_rate || "0", 10),
  fileSize: parseInt(probe.format?.size || "0", 10),
  hasAudio: !!audioStream,
};

const outputPath = path.join("public", "video-metadata.json");
writeFileSync(outputPath, JSON.stringify(metadata, null, 2));

console.log(`Metadata saved to ${outputPath}`);
console.log(`  Duration: ${metadata.duration.toFixed(2)}s`);
console.log(`  Dimensions: ${metadata.width}x${metadata.height}`);
console.log(`  FPS: ${Math.round(metadata.fps)}`);
console.log(`  Video codec: ${metadata.videoCodec}`);
console.log(`  Audio: ${metadata.hasAudio ? metadata.audioCodec : "none"}`);
