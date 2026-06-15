/**
 * Supabase Storage helpers for video files.
 * Videos are stored in the "videos" bucket.
 * Path convention: {projectId}/{sanitizedFilename}
 */

import { getSupabaseClient } from "./supabase-client";

const BUCKET = "videos";

export async function createSignedUploadUrl(
  projectId: string,
  filename: string
): Promise<{ signedUrl: string; storagePath: string }> {
  const supabase = getSupabaseClient();
  const storagePath = `${projectId}/${filename}`;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error) throw new Error(`Failed to create upload URL: ${error.message}`);
  if (!data?.signedUrl) throw new Error("No signed URL returned");

  return { signedUrl: data.signedUrl, storagePath };
}

export async function getPublicUrl(storagePath: string): Promise<string> {
  const supabase = getSupabaseClient();
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

export async function downloadToBuffer(storagePath: string): Promise<Buffer> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error) throw new Error(`Failed to download ${storagePath}: ${error.message}`);
  if (!data) throw new Error("No data returned from storage");
  return Buffer.from(await data.arrayBuffer());
}

export async function deleteFile(storagePath: string): Promise<void> {
  const supabase = getSupabaseClient();
  await supabase.storage.from(BUCKET).remove([storagePath]);
}

/** Convert a storage path to the "supabase:" prefixed value stored in DB */
export function toDbPath(storagePath: string): string {
  return `supabase:${storagePath}`;
}

/** Convert an R2 object key to the "r2:" prefixed value stored in DB */
export function toR2DbPath(key: string): string {
  return `r2:${key}`;
}

/** Extract the actual storage path/key from a DB value (handles both prefixes) */
export function fromDbPath(dbPath: string): string {
  if (dbPath.startsWith("supabase:")) return dbPath.slice("supabase:".length);
  if (dbPath.startsWith("r2:")) return dbPath.slice("r2:".length);
  return dbPath;
}

/** Returns true if the path points to Supabase Storage (vs local disk) */
export function isSupabasePath(dbPath: string): boolean {
  return dbPath.startsWith("supabase:");
}

/** Returns true if the path points to Cloudflare R2 */
export function isR2Path(dbPath: string): boolean {
  return dbPath.startsWith("r2:");
}

/** Returns true if the path points to ANY remote storage (R2 or Supabase),
 *  i.e. it must be downloaded before local processing. */
export function isRemotePath(dbPath: string): boolean {
  return isR2Path(dbPath) || isSupabasePath(dbPath);
}
