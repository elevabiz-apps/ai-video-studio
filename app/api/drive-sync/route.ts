export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { driveSyncQueries, type DriveSyncEntry } from "@/lib/db";

/**
 * GET /api/drive-sync
 * List all drive sync entries (processing log).
 * Query params: ?status=pending_review to filter by status.
 */
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");

  let entries: DriveSyncEntry[];
  if (status) {
    entries = driveSyncQueries.getByStatus.all(status) as DriveSyncEntry[];
  } else {
    entries = driveSyncQueries.getAll.all() as DriveSyncEntry[];
  }

  return NextResponse.json({ entries });
}

/**
 * PATCH /api/drive-sync
 * Update a sync entry status (e.g., approve for publishing).
 * Body: { id: string, status: string }
 */
export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { id, status } = body as { id?: string; status?: string };

  if (!id || !status) {
    return NextResponse.json({ error: "Missing id or status" }, { status: 400 });
  }

  const validStatuses = [
    "detected", "downloading", "processing",
    "pending_review", "approved", "publishing", "published", "failed",
  ];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 });
  }

  const existing = driveSyncQueries.getById.get(id) as DriveSyncEntry | undefined;
  if (!existing) {
    return NextResponse.json({ error: "Sync entry not found" }, { status: 404 });
  }

  driveSyncQueries.updateField(id, { status: status as DriveSyncEntry["status"] });
  const updated = driveSyncQueries.getById.get(id) as DriveSyncEntry;

  return NextResponse.json({ entry: updated });
}
