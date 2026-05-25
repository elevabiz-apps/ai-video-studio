#!/usr/bin/env npx tsx
/**
 * Upload a rendered video to social media.
 *
 * Usage:
 *   npx tsx scripts/upload.ts <video-file> [options]
 *
 * Options:
 *   --title       Video title (required)
 *   --description Video description
 *   --hashtags    Comma-separated hashtags
 *   --privacy     public | unlisted | private (default: private)
 *   --platform    youtube | youtube_short | tiktok | instagram_reel (auto-detected from filename)
 *   --metadata    Path to upload-metadata.json (overrides other flags)
 *
 * Examples:
 *   npx tsx scripts/upload.ts out/DuelosEdit_youtube_short_20260411.mp4 --title "Duelos" --privacy unlisted
 *   npx tsx scripts/upload.ts out/Video_tiktok_*.mp4 --metadata upload-metadata.json
 */
import "dotenv/config";
import {existsSync, readFileSync, writeFileSync} from "fs";
import path from "path";
import {
  UploadMetadataSchema,
  UploadManifestSchema,
  type UploadMetadata,
  type UploadResult,
  type UploadablePlatform,
} from "../src/upload/types";
import {uploadToYouTube} from "../src/upload/youtube";

const UPLOAD_LOG_PATH = path.join(process.cwd(), "out", "upload-log.json");

function parseArgs(args: string[]): {
  filePath: string;
  title?: string;
  description?: string;
  hashtags?: string[];
  privacy?: string;
  platform?: string;
  metadataPath?: string;
} {
  const filePath = args[0];
  if (!filePath || filePath.startsWith("--")) {
    console.error("Usage: npx tsx scripts/upload.ts <video-file> [options]");
    process.exit(1);
  }

  const flags: Record<string, string> = {};
  for (let i = 1; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, "");
    const value = args[i + 1];
    if (key && value) flags[key] = value;
  }

  return {
    filePath,
    title: flags.title,
    description: flags.description,
    hashtags: flags.hashtags?.split(",").map((h) => h.trim()),
    privacy: flags.privacy,
    platform: flags.platform,
    metadataPath: flags.metadata,
  };
}

function detectPlatform(filePath: string): UploadablePlatform | null {
  const name = path.basename(filePath).toLowerCase();
  if (name.includes("youtube_short")) return "youtube_short";
  if (name.includes("youtube")) return "youtube";
  if (name.includes("tiktok")) return "tiktok";
  if (name.includes("instagram_reel")) return "instagram_reel";
  return null;
}

function appendToLog(result: UploadResult): void {
  let log: UploadResult[] = [];
  if (existsSync(UPLOAD_LOG_PATH)) {
    log = JSON.parse(readFileSync(UPLOAD_LOG_PATH, "utf-8"));
  }
  log.push(result);
  writeFileSync(UPLOAD_LOG_PATH, JSON.stringify(log, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!existsSync(args.filePath)) {
    console.error(`File not found: ${args.filePath}`);
    process.exit(1);
  }

  // Determine platform
  const platform = (args.platform as UploadablePlatform) || detectPlatform(args.filePath);
  if (!platform) {
    console.error(
      "Could not detect platform from filename. Use --platform youtube|youtube_short|tiktok|instagram_reel"
    );
    process.exit(1);
  }

  // Build metadata
  let metadata: UploadMetadata;

  if (args.metadataPath) {
    const manifest = UploadManifestSchema.parse(
      JSON.parse(readFileSync(args.metadataPath, "utf-8"))
    );
    const platformConfig = manifest.platforms[platform] || {};
    metadata = UploadMetadataSchema.parse({
      title: manifest.title,
      description: manifest.description,
      hashtags: manifest.hashtags,
      privacy: platformConfig.privacy || "private",
      categoryId: platformConfig.categoryId,
    });
  } else {
    if (!args.title) {
      console.error("--title is required (or use --metadata with a JSON file)");
      process.exit(1);
    }
    metadata = UploadMetadataSchema.parse({
      title: args.title,
      description: args.description || "",
      hashtags: args.hashtags || [],
      privacy: args.privacy || "private",
    });
  }

  console.log(`\n=== Upload to ${platform} ===`);
  console.log(`File: ${args.filePath}`);
  console.log(`Title: ${metadata.title}`);

  let result: UploadResult;

  try {
    switch (platform) {
      case "youtube":
      case "youtube_short":
        result = await uploadToYouTube(args.filePath, metadata);
        break;
      case "tiktok":
        console.error("TikTok upload not yet implemented. Requires app review approval.");
        console.error("Apply at: https://developer.tiktok.com");
        process.exit(1);
      case "instagram_reel":
        console.error("Instagram upload not yet implemented. Requires Meta app review.");
        console.error("Apply at: https://developers.facebook.com");
        process.exit(1);
      default:
        console.error(`Unsupported platform: ${platform}`);
        process.exit(1);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    result = {
      timestamp: new Date().toISOString(),
      file: path.basename(args.filePath),
      platform,
      videoId: "",
      url: "",
      status: "error",
      error: errorMsg,
    };
    console.error(`\nUpload failed: ${errorMsg}`);
  }

  appendToLog(result);
  console.log(`\nLog saved to: ${UPLOAD_LOG_PATH}`);

  if (result.status === "error") process.exit(1);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
