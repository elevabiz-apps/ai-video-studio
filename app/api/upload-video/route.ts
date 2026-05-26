export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min timeout for large uploads

import { NextRequest, NextResponse } from "next/server";
import { getProjectById, updateProjectField } from "@/lib/db-async";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
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

  // Stream directly to disk — avoids loading entire video into RAM
  // (critical for large files on Railway's 512MB container)
  const fileStream = Readable.fromWeb(file.stream() as Parameters<typeof Readable.fromWeb>[0]);
  const writeStream = fs.createWriteStream(filePath);
  await pipeline(fileStream, writeStream);

  const fileSize = fs.statSync(filePath).size;

  // Update project
  const relativePath = `assets/${fileName}`;
  await updateProjectField(projectId, {
    source_video: relativePath,
    status: "draft",
  });

  return NextResponse.json({
    path: relativePath,
    url: `/${relativePath}`,
    size: fileSize,
  });
}
