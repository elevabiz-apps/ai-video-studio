export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getRenderById } from "@/lib/db-async";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ renderId: string }> }
) {
  const { renderId } = await params;
  const r = await getRenderById(renderId);
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(r);
}
