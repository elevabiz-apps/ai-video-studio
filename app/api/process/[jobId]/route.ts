export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { jobQueries } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  // SSE streaming for real-time progress
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      // Poll job status every 800ms
      const interval = setInterval(() => {
        const job = jobQueries.getById.get(jobId);
        if (!job) {
          clearInterval(interval);
          controller.close();
          return;
        }

        send({
          status: job.status,
          progress: job.progress,
          current_step: job.current_step,
          error: job.error,
          result: job.result ? JSON.parse(job.result) : null,
        });

        if (job.status === "complete" || job.status === "failed") {
          clearInterval(interval);
          setTimeout(() => {
            if (!closed) controller.close();
          }, 500);
        }
      }, 800);

      return () => {
        closed = true;
        clearInterval(interval);
      };
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
