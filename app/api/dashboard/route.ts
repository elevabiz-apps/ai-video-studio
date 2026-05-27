export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { isDriveAuthenticated, hasDriveConfig } from "@/lib/drive-client";
import { hasBlotatoKey } from "@/lib/blotato";
import { hasApifyToken } from "@/lib/apify-client";
import {
  autoConfigQueries,
  driveSyncQueries,
  contentProfileQueries,
  type AutoConfig,
  type DriveSyncEntry,
  type ContentProfile,
} from "@/lib/db";

/**
 * GET /api/dashboard
 * Returns all data needed to render the automation dashboard:
 * - Connection status (Drive, Blotato, Apify)
 * - Auto-config settings
 * - Recent sync log entries
 * - Content profiles
 * - Summary stats
 */
export async function GET() {
  // Connection status
  const connections = {
    drive: {
      configured: hasDriveConfig(),
      authenticated: isDriveAuthenticated(),
    },
    blotato: {
      configured: hasBlotatoKey(),
    },
    apify: {
      configured: hasApifyToken(),
    },
  };

  // Auto-config
  const configs = autoConfigQueries.getAll.all() as AutoConfig[];

  // Recent sync log (last 50 entries)
  const syncLog = driveSyncQueries.getAll.all().slice(0, 50) as DriveSyncEntry[];

  // Content profiles
  const profiles = contentProfileQueries.getAll.all() as ContentProfile[];

  // Stats
  const pendingReview = syncLog.filter((e) => e.status === "pending_review").length;
  const processing = syncLog.filter((e) => e.status === "processing" || e.status === "downloading").length;
  const published = syncLog.filter((e) => e.status === "published").length;
  const failed = syncLog.filter((e) => e.status === "failed").length;

  return NextResponse.json({
    connections,
    configs,
    syncLog,
    profiles,
    stats: {
      pendingReview,
      processing,
      published,
      failed,
      totalProcessed: syncLog.length,
    },
  });
}
