#!/usr/bin/env npx tsx
/**
 * Interactive setup for social media upload credentials.
 * Guides through API key configuration and OAuth authorization.
 *
 * Usage: npx tsx scripts/setup-upload.ts
 */
import "dotenv/config";
import {existsSync, writeFileSync, readFileSync} from "fs";
import path from "path";
import {createInterface} from "readline";
import {getYouTubeAuth} from "../src/upload/auth";

const ENV_PATH = path.join(process.cwd(), ".env");

function prompt(question: string): Promise<string> {
  const rl = createInterface({input: process.stdin, output: process.stdout});
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function setupYouTube() {
  console.log("\n=== YouTube Setup ===\n");
  console.log("To upload videos to YouTube, you need a Google Cloud project with the YouTube Data API enabled.\n");
  console.log("Steps:");
  console.log("  1. Go to https://console.cloud.google.com/");
  console.log("  2. Create a new project (or select existing)");
  console.log("  3. Enable the 'YouTube Data API v3'");
  console.log("  4. Go to Credentials → Create Credentials → OAuth 2.0 Client ID");
  console.log("  5. Application type: Desktop app");
  console.log("  6. Copy the Client ID and Client Secret\n");

  const clientId = process.env.YOUTUBE_CLIENT_ID || await prompt("YouTube Client ID: ");
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET || await prompt("YouTube Client Secret: ");

  if (!clientId || !clientSecret) {
    console.error("Client ID and Secret are required.");
    process.exit(1);
  }

  // Write to .env
  let envContent = "";
  if (existsSync(ENV_PATH)) {
    envContent = readFileSync(ENV_PATH, "utf-8");
  }

  const updates: Record<string, string> = {
    YOUTUBE_CLIENT_ID: clientId,
    YOUTUBE_CLIENT_SECRET: clientSecret,
    YOUTUBE_REDIRECT_URI: "urn:ietf:wg:oauth:2.0:oob",
  };

  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      envContent += `${envContent.endsWith("\n") || envContent === "" ? "" : "\n"}${key}=${value}\n`;
    }
  }

  writeFileSync(ENV_PATH, envContent);
  console.log("\nCredentials saved to .env");

  // Set env vars for current process
  process.env.YOUTUBE_CLIENT_ID = clientId;
  process.env.YOUTUBE_CLIENT_SECRET = clientSecret;
  process.env.YOUTUBE_REDIRECT_URI = "urn:ietf:wg:oauth:2.0:oob";

  // Run OAuth flow
  console.log("\nNow let's authorize your YouTube account...\n");
  await getYouTubeAuth();
  console.log("YouTube setup complete!\n");
}

async function main() {
  console.log("=== AI Video Studio — Upload Setup ===\n");
  console.log("This will configure your social media API credentials.\n");
  console.log("Available platforms:");
  console.log("  1. YouTube (ready to use)");
  console.log("  2. TikTok (requires app review — coming soon)");
  console.log("  3. Instagram (requires app review — coming soon)");
  console.log("");

  const choice = await prompt("Which platform to set up? (1/2/3): ");

  switch (choice) {
    case "1":
      await setupYouTube();
      break;
    case "2":
      console.log("\nTikTok upload requires app review approval.");
      console.log("Apply at: https://developer.tiktok.com");
      console.log("Once approved, run this setup again.\n");
      break;
    case "3":
      console.log("\nInstagram upload requires Meta app review.");
      console.log("Apply at: https://developers.facebook.com");
      console.log("Once approved, run this setup again.\n");
      break;
    default:
      console.error("Invalid choice.");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Setup failed:", err.message);
  process.exit(1);
});
