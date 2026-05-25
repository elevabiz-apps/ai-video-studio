import {google} from "googleapis";
import {createReadStream, statSync} from "fs";
import path from "path";
import {getYouTubeAuth} from "./auth";
import {withRetry} from "./retry";
import type {UploadMetadata, UploadResult} from "./types";

export async function uploadToYouTube(
  filePath: string,
  metadata: UploadMetadata,
): Promise<UploadResult> {
  const auth = await getYouTubeAuth();
  const youtube = google.youtube({version: "v3", auth});

  const fileSize = statSync(filePath).size;
  const fileName = path.basename(filePath);
  const sizeMB = (fileSize / 1024 / 1024).toFixed(1);

  // Build description with hashtags
  let description = metadata.description;
  if (metadata.hashtags.length > 0) {
    const tags = metadata.hashtags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ");
    description = description ? `${description}\n\n${tags}` : tags;
  }

  console.log(`Uploading to YouTube: "${metadata.title}" (${sizeMB} MB)`);
  console.log(`  Privacy: ${metadata.privacy}`);

  const result = await withRetry(async () => {
    const response = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: metadata.title,
          description,
          tags: metadata.hashtags,
          categoryId: metadata.categoryId || "22", // People & Blogs
          defaultLanguage: "es",
          defaultAudioLanguage: "es",
        },
        status: {
          privacyStatus: metadata.privacy,
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        body: createReadStream(filePath),
      },
    }, {
      onUploadProgress: (evt) => {
        const progress = evt.bytesRead ? Math.round((evt.bytesRead / fileSize) * 100) : 0;
        process.stdout.write(`\r  Upload progress: ${progress}%`);
      },
    });

    return response.data;
  });

  const videoId = result.id!;
  const isShort = filePath.includes("youtube_short") || filePath.includes("tiktok");
  const url = isShort
    ? `https://youtube.com/shorts/${videoId}`
    : `https://youtube.com/watch?v=${videoId}`;

  console.log(`\n  Uploaded: ${url}`);

  return {
    timestamp: new Date().toISOString(),
    file: fileName,
    platform: filePath.includes("youtube_short") ? "youtube_short" : "youtube",
    videoId,
    url,
    status: "success",
  };
}
