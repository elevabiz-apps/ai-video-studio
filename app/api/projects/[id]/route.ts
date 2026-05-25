export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { projectQueries, renderQueries, clipQueries } from "@/lib/db";
import fs from "fs";
import path from "path";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = projectQueries.getById.get(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(project);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = projectQueries.getById.get(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  projectQueries.updateField(id, body);

  const updated = projectQueries.getById.get(id);
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const project = projectQueries.getById.get(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const publicDir = path.join(process.cwd(), "public");

  // Delete render files
  const renders = renderQueries.getByProject.all(id);
  for (const render of renders) {
    if (render.output_path) {
      try { fs.unlinkSync(path.join(publicDir, render.output_path)); } catch { /* ignore */ }
    }
  }

  // Delete clip files
  const clips = clipQueries.getByProject.all(id);
  for (const clip of clips) {
    if (clip.output_path) {
      try { fs.unlinkSync(path.join(publicDir, clip.output_path)); } catch { /* ignore */ }
    }
  }

  // Delete source video (processed)
  if (project.source_video) {
    try { fs.unlinkSync(path.join(publicDir, project.source_video)); } catch { /* ignore */ }
  }

  // Delete original video
  if (project.original_video) {
    try { fs.unlinkSync(path.join(publicDir, project.original_video)); } catch { /* ignore */ }
  }

  // Delete all DB records (clips/renders cascade via FK, jobs cascade too)
  projectQueries.delete.run(id);

  return NextResponse.json({ success: true });
}
