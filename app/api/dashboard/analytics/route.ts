export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import db from "@/lib/db";

/**
 * GET /api/dashboard/analytics
 *
 * Returns all published posts with metrics + trend & correlation data.
 * Query params:
 *   ?platform=tiktok|instagram|youtube|all
 *   ?dateFrom=2024-01-01
 *   ?dateTo=2024-12-31
 *   ?status=published|scheduled|pending|all
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform") || "all";
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const status = searchParams.get("status") || "published";

    // ─── Main posts query ───────────────────────────────────────────────────
    let query = `
      SELECT
        u.id            AS upload_id,
        u.platform,
        u.external_post_id,
        u.status,
        u.caption,
        u.url,
        u.scheduled_at,
        u.published_at,
        u.created_at,
        c.name          AS clip_name,
        c.hook_phrase,
        c.ai_score,
        c.start_seconds,
        c.end_seconds,
        pm.views,
        pm.likes,
        pm.comments,
        pm.shares,
        pm.saves,
        pm.engagement_rate,
        pm.retention_rate,
        pm.fetched_at   AS metrics_fetched_at
      FROM uploads u
      LEFT JOIN clips c ON u.clip_id = c.id
      LEFT JOIN (
        SELECT
          upload_id,
          views, likes, comments, shares, saves,
          engagement_rate, retention_rate, fetched_at,
          ROW_NUMBER() OVER (PARTITION BY upload_id ORDER BY fetched_at DESC) AS rn
        FROM post_metrics
      ) pm ON pm.upload_id = u.id AND pm.rn = 1
      WHERE 1=1
    `;

    const params: (string | number)[] = [];

    if (status && status !== "all") {
      query += ` AND u.status = ?`;
      params.push(status);
    }
    if (platform && platform !== "all") {
      query += ` AND u.platform = ?`;
      params.push(platform);
    }
    if (dateFrom) {
      query += ` AND DATE(COALESCE(u.published_at, u.created_at)) >= ?`;
      params.push(dateFrom);
    }
    if (dateTo) {
      query += ` AND DATE(COALESCE(u.published_at, u.created_at)) <= ?`;
      params.push(dateTo);
    }

    query += ` ORDER BY COALESCE(u.published_at, u.created_at) DESC`;

    type PostRow = {
      upload_id: string;
      platform: string;
      external_post_id: string | null;
      status: string;
      caption: string | null;
      url: string | null;
      scheduled_at: string | null;
      published_at: string | null;
      created_at: string;
      clip_name: string | null;
      hook_phrase: string | null;
      ai_score: number | null;
      start_seconds: number | null;
      end_seconds: number | null;
      views: number | null;
      likes: number | null;
      comments: number | null;
      shares: number | null;
      saves: number | null;
      engagement_rate: number | null;
      retention_rate: number | null;
      metrics_fetched_at: string | null;
    };

    const posts = db.prepare(query).all(...params) as PostRow[];

    // ─── Summary stats ──────────────────────────────────────────────────────
    const postsWithMetrics = posts.filter((p) => p.views !== null && p.views > 0);
    const totalViews = postsWithMetrics.reduce((s, p) => s + (p.views ?? 0), 0);
    const avgER =
      postsWithMetrics.length > 0
        ? postsWithMetrics.reduce((s, p) => s + (p.engagement_rate ?? 0), 0) /
          postsWithMetrics.length
        : 0;
    const bestPost = postsWithMetrics.length > 0 ? postsWithMetrics[0] : null;

    // ─── Trends: views grouped by week ─────────────────────────────────────
    // Builds from the already-filtered posts to respect current filters.
    const trendMap = new Map<string, { views: number; posts: number }>();
    for (const p of posts) {
      const dateStr = (p.published_at ?? p.created_at).slice(0, 10); // YYYY-MM-DD
      // Group into ISO weeks (Monday = start)
      const d = new Date(dateStr);
      const dayOfWeek = d.getDay(); // 0 = Sun
      const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      const weekStart = new Date(d.setDate(diff)).toISOString().slice(0, 10);

      const cur = trendMap.get(weekStart) ?? { views: 0, posts: 0 };
      cur.views += p.views ?? 0;
      cur.posts += 1;
      trendMap.set(weekStart, cur);
    }
    const trendsData = Array.from(trendMap.entries())
      .map(([week, v]) => ({ week, views: v.views, posts: v.posts }))
      .sort((a, b) => a.week.localeCompare(b.week))
      .slice(-16); // last 16 weeks max

    // ─── Correlation: ai_score vs engagement_rate ───────────────────────────
    const correlationData = posts
      .filter((p) => p.ai_score !== null && p.engagement_rate !== null)
      .map((p) => ({
        aiScore: Math.round(p.ai_score!),
        engagementRate: Math.round((p.engagement_rate ?? 0) * 100) / 100,
        views: p.views ?? 0,
        clipName: p.clip_name ?? p.hook_phrase ?? "Clip",
        platform: p.platform,
      }));

    // Pearson correlation coefficient
    let pearson: number | null = null;
    if (correlationData.length >= 5) {
      const xs = correlationData.map((d) => d.aiScore);
      const ys = correlationData.map((d) => d.engagementRate);
      const n = xs.length;
      const mx = xs.reduce((a, b) => a + b, 0) / n;
      const my = ys.reduce((a, b) => a + b, 0) / n;
      let num = 0, dx2 = 0, dy2 = 0;
      for (let i = 0; i < n; i++) {
        const dx = xs[i] - mx;
        const dy = ys[i] - my;
        num += dx * dy;
        dx2 += dx * dx;
        dy2 += dy * dy;
      }
      const den = Math.sqrt(dx2 * dy2);
      pearson = den === 0 ? 0 : Math.round((num / den) * 100) / 100;
    }

    return NextResponse.json({
      posts,
      stats: {
        totalPosts: posts.length,
        publishedPosts: posts.filter((p) => p.status === "published").length,
        scheduledPosts: posts.filter((p) => p.status === "scheduled").length,
        postsWithMetrics: postsWithMetrics.length,
        totalViews,
        avgEngagementRate: Math.round(avgER * 100) / 100,
        bestPost: bestPost
          ? {
              clipName: bestPost.clip_name ?? bestPost.hook_phrase ?? "Unnamed",
              platform: bestPost.platform,
              views: bestPost.views,
              engagementRate: bestPost.engagement_rate,
            }
          : null,
      },
      trendsData,
      correlationData,
      pearsonCorrelation: pearson,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[analytics] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
