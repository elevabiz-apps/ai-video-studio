import type {UploadMetadata, UploadManifest, UploadablePlatform} from "./types";

const YOUTUBE_CATEGORIES: Record<string, string> = {
  people: "22",        // People & Blogs
  entertainment: "24",
  education: "27",
  science: "28",
  howto: "26",         // Howto & Style
  sports: "17",
  music: "10",
  comedy: "23",
  news: "25",
};

export function buildMetadataForPlatform(
  manifest: UploadManifest,
  platform: UploadablePlatform,
): UploadMetadata {
  const platformConfig = manifest.platforms[platform] || {};

  const base: UploadMetadata = {
    title: manifest.title,
    description: manifest.description,
    hashtags: manifest.hashtags,
    privacy: platformConfig.privacy || "private",
    categoryId: platformConfig.categoryId,
  };

  switch (platform) {
    case "youtube":
    case "youtube_short":
      return {
        ...base,
        categoryId: base.categoryId || YOUTUBE_CATEGORIES.people,
      };

    case "tiktok":
      // TikTok: max 150 chars description, hashtags appended
      return {
        ...base,
        description: base.description.slice(0, 150),
      };

    case "instagram_reel":
      // Instagram: max 2200 chars caption, max 30 hashtags
      return {
        ...base,
        hashtags: base.hashtags.slice(0, 30),
        description: base.description.slice(0, 2200),
      };

    default:
      return base;
  }
}

export {YOUTUBE_CATEGORIES};
