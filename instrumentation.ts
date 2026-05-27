/**
 * Next.js instrumentation hook — runs once at server startup.
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * On startup:
 *  1. Marks any "rendering" or "queued" renders as "failed" (interrupted by container restart).
 *  2. Starts a Drive watcher cron — polls Google Drive every 5 minutes for new videos.
 */
export async function register() {
  // Only run in the Node.js runtime (not in the Edge runtime / client bundle)
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // ── 1. Reset stuck renders ────────────────────────────────────────────────
  try {
    const { hasSupabase, getSupabaseClient } = await import("./lib/supabase-client");

    if (hasSupabase()) {
      const sb = getSupabaseClient() as ReturnType<typeof getSupabaseClient>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: stuck, error } = await (sb as any)
        .from("renders")
        .select("id")
        .in("status", ["rendering", "queued"]);

      if (error) {
        console.warn("[startup] Could not query stuck renders:", error.message);
      } else if (stuck && stuck.length > 0) {
        console.log(`[startup] Resetting ${stuck.length} stuck render(s) to "failed"`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb as any)
          .from("renders")
          .update({ status: "failed", error: "Container restarted — render interrupted" })
          .in("status", ["rendering", "queued"]);
      }
    }
  } catch (err) {
    console.warn("[startup] Render cleanup failed:", err);
  }

  // ── 2. Drive watcher cron — every 5 minutes ───────────────────────────────
  // Only start if Google Drive is configured (env vars present).
  const hasGoogleConfig = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  if (!hasGoogleConfig) {
    console.log("[drive-cron] GOOGLE_CLIENT_ID/SECRET not set — watcher disabled.");
    return;
  }

  const FIVE_MINUTES = 5 * 60 * 1000;

  const runDriveCheck = async () => {
    try {
      const { checkDriveForNewVideos } = await import("./lib/drive-watcher");
      const result = await checkDriveForNewVideos();
      if (result.newFiles > 0) {
        console.log(`[drive-cron] Found ${result.newFiles} new file(s) in Drive.`);
      }
      if (result.errors.length > 0) {
        console.warn("[drive-cron] Errors:", result.errors.join(", "));
      }
    } catch (err) {
      console.error("[drive-cron] Unexpected error:", err);
    }
  };

  // Run once after a short delay on startup (let the server fully boot first)
  setTimeout(runDriveCheck, 30_000);

  // Then repeat every 5 minutes
  setInterval(runDriveCheck, FIVE_MINUTES);

  console.log("[drive-cron] Drive watcher started — polling every 5 minutes.");
}
