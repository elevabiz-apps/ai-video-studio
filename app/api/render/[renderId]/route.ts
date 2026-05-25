export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ renderId: string }> }
) {
  const { renderId } = await params;
  const r = db.prepare("SELECT * FROM renders WHERE id = ?").get(renderId);
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(r);
}
