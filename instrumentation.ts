/**
 * Next.js instrumentation hook — runs once at server startup.
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * On startup we mark any "rendering" or "queued" renders as "failed".
 * These are renders whose Node.js process was killed by a container restart
 * (e.g., Railway redeploying) — they will never complete, so leaving them
 * as "rendering" would freeze the UI on the client forever.
 */
export async function register() {
  // Only run in the Node.js runtime (not in the Edge runtime / client bundle)
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

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
        return;
      }

      if (stuck && stuck.length > 0) {
        console.log(`[startup] Resetting ${stuck.length} stuck render(s) to "failed"`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb as any)
          .from("renders")
          .update({ status: "failed", error: "Container restarted — render interrupted" })
          .in("status", ["rendering", "queued"]);
      }
    }
  } catch (err) {
    // Don't crash the server if cleanup fails — just log and continue
    console.warn("[startup] Render cleanup failed:", err);
  }
}
