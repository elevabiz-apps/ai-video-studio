export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAllProjects, createProject, getProjectById } from "@/lib/db-async";
import { randomUUID } from "crypto";

export async function GET() {
  const projects = await getAllProjects();
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, mode = "single" } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const id = randomUUID();
  await createProject(id, name.trim(), mode);

  const project = await getProjectById(id);
  return NextResponse.json(project, { status: 201 });
}
