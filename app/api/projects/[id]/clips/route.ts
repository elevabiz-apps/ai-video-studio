export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getClipsByProject } from "@/lib/db-async";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const clips = await getClipsByProject(id);
  return NextResponse.json(clips);
}
