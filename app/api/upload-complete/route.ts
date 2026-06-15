export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getProjectById, updateProjectField } from "@/lib/db-async";
import { toDbPath, toR2DbPath } from "@/lib/storage";
import { hasR2, completeMultipartUpload, abortMultipartUpload, type CompletedPart } from "@/lib/r2";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { projectId } = body;

  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  }

  const project = await getProjectById(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // ── R2 multipart completion (browser uploaded the parts directly to R2) ──────
  if (body.key && body.uploadId && Array.isArray(body.parts)) {
    if (!hasR2()) {
      return NextResponse.json({ error: "R2 not configured" }, { status: 400 });
    }
    const { key, uploadId } = body as { key: string; uploadId: string };
    const parts = body.parts as CompletedPart[];
    if (
      !parts.length ||
      !parts.every(
        (p) => Number.isInteger(p?.PartNumber) && typeof p?.ETag === "string" && p.ETag.length > 0
      )
    ) {
      return NextResponse.json({ error: "Invalid parts" }, { status: 400 });
    }
    try {
      await completeMultipartUpload(key, uploadId, parts);
    } catch (err) {
      console.error("[upload-complete] R2 complete failed:", err);
      await abortMultipartUpload(key, uploadId);
      return NextResponse.json({ error: "No se pudo finalizar la subida a R2" }, { status: 500 });
    }
    await updateProjectField(projectId, {
      source_video: toR2DbPath(key),
      status: "draft",
    });
    const updated = await getProjectById(projectId);
    return NextResponse.json(updated);
  }

  // ── Legacy: Supabase Storage path ────────────────────────────────────────────
  const { storagePath } = body;
  if (!storagePath) {
    return NextResponse.json({ error: "Missing storagePath" }, { status: 400 });
  }
  await updateProjectField(projectId, {
    source_video: toDbPath(storagePath),
    status: "draft",
  });
  const updated = await getProjectById(projectId);
  return NextResponse.json(updated);
}
