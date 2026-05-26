/**
 * Upload Manager — orchestrates publishing clips/renders to social media.
 *
 * Flow:
 *  1. Read the video file from disk (public/assets/ or public/renders/)
 *  2. Upload the file to Blotato media storage
 *  3. Create a Blotato post (immediate or scheduled)
 *  4. Update the uploads DB row with status + external IDs
 */

import fs from "fs";
import path from "path";
import { uploadMedia, createPost, type BlotatoPlatform } from "./blotato";
import { hasSupabase, getSupabaseClient } from "./supabase-client";

const CWD = process.cwd();

// ─── DB helpers (mirrors db-async pattern) ────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function supabase(): any { return getSupabaseClient(); }
function sqlite() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("./db") as typeof import("./db");
}

export async function createUploadRecord(
  id: string,
  clipId: string | null,
  renderId: string | null,
  platform: string,
  caption: string
): Promise<void> {
  if (hasSupabase()) {
    const { error } = await supabase()
      .from("uploads")
      .insert({ id, clip_id: clipId, render_id: renderId, platform, provider: "blotato", caption });
    if (error) throw error;
    return;
  }
  sqlite().uploadQueries.create.run(id, clipId, renderId, platform, "blotato", caption);
}

export async function updateUploadRecord(
  id: string,
  status: string,
  externalPostId: string | null,
  url: string | null,
  error: string | null,
  scheduledAt: string | null
): Promise<void> {
  if (hasSupabase()) {
    const { error: err } = await supabase()
      .from("uploads")
      .update({ status, external_post_id: externalPostId, url, error, scheduled_at: scheduledAt })
      .eq("id", id);
    if (err) throw err;
    return;
  }
  sqlite().uploadQueries.update.run(status, externalPostId, url, error, scheduledAt, id);
}

export async function getUploadById(id: string) {
  if (hasSupabase()) {
    const { data, error } = await supabase()
      .from("uploads")
      .select("*")
      .eq("id", id)
      .single();
    if (error && (error as { code?: string }).code === "PGRST116") return null;
    if (error) throw error;
    return data;
  }
  return sqlite().uploadQueries.getById.get(id) ?? null;
}

export async function getUploadsByClip(clipId: string) {
  if (hasSupabase()) {
    const { data, error } = await supabase()
      .from("uploads")
      .select("*")
      .eq("clip_id", clipId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  }
  return sqlite().uploadQueries.getByClip.all(clipId);
}

export async function getUploadsByRender(renderId: string) {
  if (hasSupabase()) {
    const { data, error } = await supabase()
      .from("uploads")
      .select("*")
      .eq("render_id", renderId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  }
  return sqlite().uploadQueries.getByRender.all(renderId);
}

// ─── Core publish flow ────────────────────────────────────────────────────────

export interface PublishOptions {
  uploadId: string;
  filePath: string;       // relative to public/, e.g. "assets/clip01.mp4" or "renders/render_video_...mp4"
  platforms: BlotatoPlatform[];
  caption: string;
  scheduledAt?: Date;
  accountIds?: string[];
}

/**
 * Runs the full publish pipeline async (non-blocking from the API route).
 * Updates DB as it goes so the client can poll /api/publish/[uploadId].
 *
 * Note: This is called once per (clip/render × platform) combination.
 * For multi-platform, the caller creates one upload record per platform and calls this once each.
 */
export async function runPublish(opts: PublishOptions): Promise<void> {
  const { uploadId, filePath, platforms, caption, scheduledAt, accountIds } = opts;

  try {
    await updateUploadRecord(uploadId, "uploading", null, null, null, null);

    // 1. Read file from disk
    const absPath = path.join(CWD, "public", filePath);
    if (!fs.existsSync(absPath)) {
      throw new Error(`File not found: ${absPath}`);
    }
    const fileBuffer = fs.readFileSync(absPath);
    const filename = path.basename(filePath);

    // 2. Upload to Blotato media storage
    const { media_id } = await uploadMedia(fileBuffer, filename, "video/mp4");

    // 3. Create post on Blotato
    const posts = await createPost({
      mediaIds: [media_id],
      caption,
      platforms,
      scheduledAt,
      accountIds,
    });

    // Use the first post result (one per platform is expected by Blotato)
    const post = posts[0];
    if (!post) throw new Error("Blotato returned no post results");

    const status = scheduledAt ? "scheduled" : (post.status === "published" ? "published" : "scheduled");
    await updateUploadRecord(
      uploadId,
      status,
      post.post_id,
      post.url ?? null,
      null,
      scheduledAt?.toISOString() ?? post.scheduled_at ?? null
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[upload] ERROR for uploadId=${uploadId}: ${msg}`);
    await updateUploadRecord(uploadId, "failed", null, null, msg, null);
    // Don't rethrow — status is captured in DB, client can poll
  }
}
