export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { hasBlotatoKey } from "@/lib/blotato";
import {
  createUploadRecord,
  runPublish,
  type PublishOptions,
} from "@/lib/upload-manager";
import type { BlotatoPlatform } from "@/lib/blotato";

/**
 * POST /api/publish
 *
 * Body:
 * {
 *   filePath: string,          // relative to public/ — "assets/clip.mp4" or "renders/render_xxx.mp4"
 *   platforms: string[],       // ["tiktok", "instagram", ...]
 *   caption: string,
 *   clipId?: string,
 *   renderId?: string,
 *   scheduledAt?: string,      // ISO timestamp (optional — publish now if omitted)
 *   accountIds?: string[],     // optional Blotato account IDs to filter by
 * }
 *
 * Returns { uploadIds: string[] } — one per platform, to poll /api/publish/[uploadId]
 */
export async function POST(req: NextRequest) {
  if (!hasBlotatoKey()) {
    return NextResponse.json(
      { error: "BLOTATO_API_KEY not configured. Add it in Railway environment variables." },
      { status: 503 }
    );
  }

  const body = await req.json();
  const { filePath, platforms, caption, clipId, renderId, scheduledAt, accountIds } = body as {
    filePath: string;
    platforms: string[];
    caption: string;
    clipId?: string;
    renderId?: string;
    scheduledAt?: string;
    accountIds?: string[];
  };

  if (!filePath || !platforms?.length || typeof caption !== "string") {
    return NextResponse.json({ error: "Missing required fields: filePath, platforms, caption" }, { status: 400 });
  }

  const scheduledDate = scheduledAt ? new Date(scheduledAt) : undefined;

  // Create one upload record per platform so each can be tracked independently
  const uploadIds: string[] = [];
  for (const platform of platforms) {
    const uploadId = randomUUID();
    await createUploadRecord(
      uploadId,
      clipId ?? null,
      renderId ?? null,
      platform,
      caption
    );
    uploadIds.push(uploadId);

    // Fire-and-forget — runPublish updates DB status as it progresses
    const opts: PublishOptions = {
      uploadId,
      filePath,
      platforms: [platform as BlotatoPlatform],
      caption,
      scheduledAt: scheduledDate,
      accountIds,
    };
    runPublish(opts).catch((err) =>
      console.error(`[publish] Unhandled error for ${uploadId}:`, err)
    );
  }

  return NextResponse.json({ uploadIds });
}
