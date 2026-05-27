export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { checkDriveForNewVideos } from "@/lib/drive-watcher";

/**
 * GET /api/cron/check-drive
 * Cron endpoint — checks Google Drive folder(s) for new videos.
 * Should be called every 5 minutes by Railway cron or external scheduler.
 *
 * Can also be called manually from the dashboard.
 */
export async function GET() {
  try {
    const result = await checkDriveForNewVideos();
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron/check-drive] Error:", msg);
    return NextResponse.json(
      { checked: false, newFiles: 0, errors: [msg] },
      { status: 500 }
    );
  }
}
