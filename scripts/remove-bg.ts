#!/usr/bin/env npx tsx
/**
 * Remove background from an image using AI.
 * Usage: npx tsx scripts/remove-bg.ts public/assets/photo.jpg [output-path]
 * Output: public/assets/photo-nobg.png
 */
import {readFileSync, writeFileSync} from "fs";
import path from "path";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: npx tsx scripts/remove-bg.ts <image-path> [output-path]");
  process.exit(1);
}

const ext = path.extname(inputPath);
const baseName = path.basename(inputPath, ext);
const dir = path.dirname(inputPath);
const outputPath = process.argv[3] || path.join(dir, `${baseName}-nobg.png`);

async function main() {
  console.log(`Removing background from: ${inputPath}`);
  console.log("Loading AI model (first time may take a moment)...");

  const {removeBackground} = await import("@imgly/background-removal-node");

  const imageBuffer = readFileSync(inputPath);
  const blob = new Blob([imageBuffer]);

  const result = await removeBackground(blob);
  const arrayBuffer = await result.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  writeFileSync(outputPath, buffer);
  console.log(`\nBackground removed successfully!`);
  console.log(`Output: ${outputPath}`);
}

main().catch((err) => {
  console.error("Background removal failed:", err.message);
  process.exit(1);
});
