export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import {
  getProjectById,
  updateProjectField,
  deleteProject,
  getRendersByProject,
  getClipsByProject,
} from "@/lib/db-async";
import fs from "fs";
import path from "path";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await getProjectById(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(project);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await getProjectById(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  // Whitelist editable fields — never pass the raw body to updateProjectField,
  // which interpolates object KEYS into the SQL SET clause (mass-assignment + SQLi).
  const ALLOWED = ["name", "caption_preset", "caption_style"] as const;
  const fields: Record<string, unknown> = {};
  for (const k of ALLOWED) {
    if (k in body) fields[k] = body[k];
  }
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: "No editable fields provided" }, { status: 400 });
  }
  await updateProjectField(id, fields);

  const updated = await getProjectById(id);
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const project = await getProjectById(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const publicDir = path.join(process.cwd(), "public");

  // Only unlink files that resolve INSIDE public/ — guards against a DB row whose
  // path contains traversal (defense-in-depth alongside the PATCH whitelist).
  const safeUnlink = (relPath: string) => {
    const abs = path.resolve(publicDir, relPath);
    if (abs === publicDir || !abs.startsWith(publicDir + path.sep)) return;
    try { fs.unlinkSync(abs); } catch { /* ignore */ }
  };

  // Delete render files
  const renders = await getRendersByProject(id);
  for (const render of renders) {
    if (render.output_path) safeUnlink(render.output_path);
  }

  // Delete clip files
  const clips = await getClipsByProject(id);
  for (const clip of clips) {
    if (clip.output_path) safeUnlink(clip.output_path);
  }

  // Delete source video (processed) + original video
  if (project.source_video) safeUnlink(project.source_video);
  if (project.original_video) safeUnlink(project.original_video);

  // Delete all DB records (clips/renders cascade via FK, jobs cascade too)
  await deleteProject(id);

  return NextResponse.json({ success: true });
}
