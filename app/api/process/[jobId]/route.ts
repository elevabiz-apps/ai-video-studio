export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getJobById } from "@/lib/db-async";

// Parse job.result defensively — a corrupt/partial value must not throw before the
// stream-close check below (that would poll a finished job forever).
function safeParse(s: string | null): unknown {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      function send(data: object) {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      async function poll() {
        if (closed) return;
        try {
          const job = await getJobById(jobId);
          if (!job) {
            controller.close();
            return;
          }

          send({
            status: job.status,
            progress: job.progress,
            current_step: job.current_step,
            error: job.error,
            result: safeParse(job.result),
          });

          if (job.status === "complete" || job.status === "failed") {
            setTimeout(() => { if (!closed) controller.close(); }, 500);
            return;
          }
        } catch (err) {
          console.error("SSE poll error:", err);
        }
        setTimeout(poll, 800);
      }

      poll();

      return () => { closed = true; };
    },
    cancel() {
      closed = true;
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
