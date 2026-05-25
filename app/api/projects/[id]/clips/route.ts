export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { clipQueries } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const clips = clipQueries.getByProject.all(id);
  return NextResponse.json(clips);
}
