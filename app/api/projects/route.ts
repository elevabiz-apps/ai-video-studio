export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { projectQueries } from "@/lib/db";
import { randomUUID } from "crypto";

export async function GET() {
  const projects = projectQueries.getAll.all();
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, mode = "single" } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const id = randomUUID();
  projectQueries.create.run(id, name.trim(), mode);

  const project = projectQueries.getById.get(id);
  return NextResponse.json(project, { status: 201 });
}
