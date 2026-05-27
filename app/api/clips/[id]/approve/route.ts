export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { clipQueries } from "@/lib/db";

/**
 * PATCH /api/clips/:id/approve
 * Body: { status: "approved" | "rejected" | "pending" }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { status } = body;

  if (!["approved", "rejected", "pending"].includes(status)) {
    return NextResponse.json(
      { error: "Invalid status. Must be: approved, rejected, or pending" },
      { status: 400 }
    );
  }

  try {
    clipQueries.updateApproval.run(status, id);
    return NextResponse.json({ ok: true, id, approval_status: status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
