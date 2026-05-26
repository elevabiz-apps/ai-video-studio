export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getProjectById, updateProjectField } from "@/lib/db-async";
import { toDbPath } from "@/lib/storage";

export async function POST(req: NextRequest) {
  const { projectId, storagePath } = await req.json();

  if (!projectId || !storagePath) {
    return NextResponse.json({ error: "Missing projectId or storagePath" }, { status: 400 });
  }

  const project = await getProjectById(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  await updateProjectField(projectId, {
    source_video: toDbPath(storagePath),
    status: "draft",
  });

  const updated = await getProjectById(projectId);
  return NextResponse.json(updated);
}
