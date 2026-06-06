export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { collectMetricsForAllUploads } from "@/lib/metrics-collector";

/**
 * GET /api/cron/collect-metrics
 * Collect performance metrics for all published posts.
 * Should be called every 6 hours by Railway cron or manually.
 */
export async function GET(req: Request) {
  // Opt-in auth: if CRON_SECRET is set, require it. No-op (backward compatible)
  // when the env var is unset, so existing schedulers keep working.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await collectMetricsForAllUploads();
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron/collect-metrics] Error:", msg);
    return NextResponse.json(
      { collected: 0, errors: [msg] },
      { status: 500 }
    );
  }
}
