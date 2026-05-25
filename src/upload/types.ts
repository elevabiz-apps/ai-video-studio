import {z} from "zod";

export const PrivacySchema = z.enum(["public", "unlisted", "private"]);
export type Privacy = z.infer<typeof PrivacySchema>;

export const UploadMetadataSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(5000).default(""),
  hashtags: z.array(z.string()).default([]),
  privacy: PrivacySchema.default("private"),
  categoryId: z.string().optional(),
});
export type UploadMetadata = z.infer<typeof UploadMetadataSchema>;

export const UploadPlatformConfigSchema = z.object({
  privacy: PrivacySchema.optional(),
  categoryId: z.string().optional(),
});

export const UploadManifestSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(""),
  hashtags: z.array(z.string()).default([]),
  platforms: z.record(z.string(), UploadPlatformConfigSchema).default({}),
});
export type UploadManifest = z.infer<typeof UploadManifestSchema>;

export const OAuthTokensSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expiry_date: z.number(),
  token_type: z.string().default("Bearer"),
  scope: z.string().optional(),
});
export type OAuthTokens = z.infer<typeof OAuthTokensSchema>;

export const StoredTokensSchema = z.object({
  youtube: OAuthTokensSchema.optional(),
  tiktok: OAuthTokensSchema.optional(),
  instagram: OAuthTokensSchema.optional(),
});
export type StoredTokens = z.infer<typeof StoredTokensSchema>;

export const UploadResultSchema = z.object({
  timestamp: z.string(),
  file: z.string(),
  platform: z.string(),
  videoId: z.string(),
  url: z.string(),
  status: z.enum(["success", "error"]),
  error: z.string().optional(),
});
export type UploadResult = z.infer<typeof UploadResultSchema>;

export type UploadablePlatform = "youtube" | "youtube_short" | "tiktok" | "instagram_reel";
