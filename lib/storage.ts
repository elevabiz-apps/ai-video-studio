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

/** Extract the actual storage path from a DB value */
export function fromDbPath(dbPath: string): string {
  return dbPath.startsWith("supabase:") ? dbPath.slice("supabase:".length) : dbPath;
}

/** Returns true if the path points to Supabase Storage (vs local disk) */
export function isSupabasePath(dbPath: string): boolean {
  return dbPath.startsWith("supabase:");
}
