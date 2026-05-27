/**
 * Metrics Collector — fetches post-publish performance data
 * from social media platform APIs.
 *
 * Currently supports:
 *   - Blotato post status (from existing integration)
 *
 * Future: direct TikTok, Instagram Graph API, YouTube Analytics API
 *
 * Called by: GET /api/cron/collect-metrics (every 6 hours)
 */

import { randomUUID } from "crypto";
import { postMetricQueries, type PostMetric } from "./db";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MetricsSnapshot {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagement_rate: number;
  retention_rate: number | null;
}

export interface CollectionResult {
  collected: number;
  errors: string[];
}

// ─── Collect from all sources ────────────────────────────────────────────────

/**
 * Collect metrics for all published uploads from the last N days.
 */
export async function collectMetricsForAllUploads(
  lookbackDays = 30
): Promise<CollectionResult> {
  const result: CollectionResult = { collected: 0, errors: [] };

  try {
    // Get all published uploads within lookback period
    const dbMod = await import("./db");
    const db = dbMod.default;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - lookbackDays);
    const cutoffStr = cutoff.toISOString();

    const uploads = db
      .prepare(
        `SELECT * FROM uploads
         WHERE status = 'published'
         AND created_at > ?
         ORDER BY created_at DESC`
      )
      .all(cutoffStr) as Array<{
        id: string;
        platform: string;
        external_post_id: string | null;
        url: string | null;
      }>;

    for (const upload of uploads) {
      try {
        // For now, create a placeholder metric entry
        // In the future, this will call platform-specific APIs
        const metrics = await fetchMetricsForUpload(upload);
        if (metrics) {
          saveMetrics(upload.id, upload.platform, metrics);
          result.collected++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`Upload ${upload.id}: ${msg}`);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`Collection error: ${msg}`);
  }

  return result;
}

/**
 * Fetch metrics for a specific upload.
 * Currently a stub — will integrate with platform APIs.
 */
async function fetchMetricsForUpload(
  upload: {
    id: string;
    platform: string;
    external_post_id: string | null;
    url: string | null;
  }
): Promise<MetricsSnapshot | null> {
  // TODO: Implement platform-specific API calls
  //
  // TikTok Content Posting API:
  //   GET /v2/video/query/ with video_id → views, likes, comments, shares
  //   Rate limit: 6 req/min
  //
  // Instagram Graph API:
  //   GET /{media-id}/insights?metric=reach,impressions,likes,...
  //   Rate limit: 200 req/hr
  //
  // YouTube Analytics API:
  //   GET /v2/reports?ids=channel==MINE&metrics=views,likes,...&filters=video==VIDEO_ID
  //   Rate limit: 10K quota units/day
  //
  // For now, we only track what's available via Blotato post status

  if (!upload.external_post_id) return null;

  // Check Blotato for updated status
  try {
    const { getPostStatus, hasBlotatoKey } = await import("./blotato");
    if (!hasBlotatoKey()) return null;

    const status = await getPostStatus(upload.external_post_id);
    if (!status) return null;

    // Blotato doesn't provide detailed metrics, just status
    // Return null to skip metric creation for now
    return null;
  } catch {
    return null;
  }
}

/**
 * Save a metrics snapshot to the database.
 */
function saveMetrics(
  uploadId: string,
  platform: string,
  metrics: MetricsSnapshot
): void {
  const id = randomUUID();
  postMetricQueries.create.run(
    id,
    uploadId,
    platform,
    metrics.views,
    metrics.likes,
    metrics.comments,
    metrics.shares,
    metrics.saves,
    metrics.engagement_rate
  );
}

/**
 * Get aggregated metrics for a content profile.
 * Used by the dashboard and the scoring feedback loop.
 */
export async function getProfileMetrics(profileId: string): Promise<{
  totalPosts: number;
  totalViews: number;
  avgEngagementRate: number;
  avgViews: number;
  scoreCorrelation: number | null;
  topPerformers: Array<{
    clipName: string;
    aiScore: number;
    views: number;
    engagementRate: number;
  }>;
}> {
  const dbMod = await import("./db");
  const db = dbMod.default;

  // Get uploads linked to clips that have this content profile
  // For now, get all published uploads and their latest metrics
  const rows = db.prepare(`
    SELECT
      u.id as upload_id,
      u.platform,
      c.name as clip_name,
      c.ai_score,
      c.hook_phrase,
      pm.views,
      pm.likes,
      pm.comments,
      pm.shares,
      pm.engagement_rate
    FROM uploads u
    LEFT JOIN clips c ON u.clip_id = c.id
    LEFT JOIN (
      SELECT upload_id, views, likes, comments, shares, engagement_rate,
             ROW_NUMBER() OVER (PARTITION BY upload_id ORDER BY fetched_at DESC) as rn
      FROM post_metrics
    ) pm ON pm.upload_id = u.id AND pm.rn = 1
    WHERE u.status = 'published'
    ORDER BY pm.views DESC NULLS LAST
  `).all() as Array<{
    upload_id: string;
    platform: string;
    clip_name: string | null;
    ai_score: number | null;
    hook_phrase: string | null;
    views: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    engagement_rate: number | null;
  }>;

  const withMetrics = rows.filter((r) => r.views !== null && r.views > 0);
  const totalViews = withMetrics.reduce((sum, r) => sum + (r.views ?? 0), 0);
  const avgER = withMetrics.length > 0
    ? withMetrics.reduce((sum, r) => sum + (r.engagement_rate ?? 0), 0) / withMetrics.length
    : 0;

  // Calculate correlation between AI score and engagement rate
  let scoreCorrelation: number | null = null;
  const scoredPosts = withMetrics.filter((r) => r.ai_score !== null && r.engagement_rate !== null);
  if (scoredPosts.length >= 5) {
    scoreCorrelation = pearsonCorrelation(
      scoredPosts.map((r) => r.ai_score!),
      scoredPosts.map((r) => r.engagement_rate!)
    );
  }

  return {
    totalPosts: rows.length,
    totalViews,
    avgEngagementRate: Math.round(avgER * 100) / 100,
    avgViews: withMetrics.length > 0 ? Math.round(totalViews / withMetrics.length) : 0,
    scoreCorrelation,
    topPerformers: withMetrics.slice(0, 10).map((r) => ({
      clipName: r.clip_name ?? r.hook_phrase ?? "Clip",
      aiScore: r.ai_score ?? 0,
      views: r.views ?? 0,
      engagementRate: r.engagement_rate ?? 0,
    })),
  };
}

// ─── Math ────────────────────────────────────────────────────────────────────

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) return 0;

  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denX = 0;
  let denY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : Math.round((num / den) * 100) / 100;
}
