export const dynamic = "force-dynamic";
// Allow large video uploads (up to 500MB)
export const maxDuration = 300;
// Next.js App Router body size limit (overrides the default 4MB)
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getProjectById, updateProjectField } from "@/lib/db-async";
import { writeFile } from "fs/promises";
import path from "path";
import fs from "fs";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const projectId = formData.get("projectId") as string | null;

  if (!file || !projectId) {
    return NextResponse.json({ error: "Missing file or projectId" }, { status: 400 });
  }

  const project = await getProjectById(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Save to public/assets/
  const assetsDir = path.join(process.cwd(), "public", "assets");
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  // Sanitize filename
  const ext = path.extname(file.name);
  const baseName = path.basename(file.name, ext).replace(/[^a-zA-Z0-9_\-. ]/g, "_");
  const fileName = `${baseName}${ext}`;
  const filePath = path.join(assetsDir, fileName);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  // Update project
  const relativePath = `assets/${fileName}`;
  await updateProjectField(projectId, {
    source_video: relativePath,
    status: "draft",
  });

  return NextResponse.json({
    path: relativePath,
    url: `/${relativePath}`,
    size: buffer.length,
  });
}
