export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { getProjectById, updateProjectField } from "@/lib/db-async";
import fs from "fs";
import path from "path";
import os from "os";

// Assembles all uploaded chunks into a single video file.
// Reads /tmp/{uploadId}.part0, .part1, ... in order,
// concatenates them, saves to public/assets/{filename},
// and updates the project DB record.
export async function POST(req: NextRequest) {
  const { projectId, uploadId, filename, totalChunks } = await req.json();

  if (!projectId || !uploadId || !filename || totalChunks == null) {
    return NextResponse.json(
      { error: "Missing projectId, uploadId, filename, or totalChunks" },
      { status: 400 }
    );
  }

  const project = await getProjectById(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const tmpDir = os.tmpdir();

  // Verify all chunks exist
  for (let i = 0; i < totalChunks; i++) {
    const chunkPath = path.join(tmpDir, `${uploadId}.part${i}`);
    if (!fs.existsSync(chunkPath)) {
      return NextResponse.json(
        { error: `Missing chunk ${i}` },
        { status: 400 }
      );
    }
  }

  // Sanitize filename
  const ext = path.extname(filename);
  const baseName = path.basename(filename, ext).replace(/[^a-zA-Z0-9_\-. ]/g, "_");
  const sanitizedFilename = `${baseName}${ext}`;

  // Ensure assets directory exists
  const assetsDir = path.join(process.cwd(), "public", "assets");
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  const outputPath = path.join(assetsDir, sanitizedFilename);
  const writeStream = fs.createWriteStream(outputPath);

  // Concatenate all chunks in order
  await new Promise<void>((resolve, reject) => {
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);

    (async () => {
      for (let i = 0; i < totalChunks; i++) {
        const chunkPath = path.join(tmpDir, `${uploadId}.part${i}`);
        const chunkData = fs.readFileSync(chunkPath);
        const ok = writeStream.write(chunkData);
        if (!ok) {
          // Wait for drain before writing more
          await new Promise<void>((res) => writeStream.once("drain", res));
        }
      }
      writeStream.end();
    })().catch(reject);
  });

  // Clean up temp chunk files
  for (let i = 0; i < totalChunks; i++) {
    const chunkPath = path.join(tmpDir, `${uploadId}.part${i}`);
    try { fs.unlinkSync(chunkPath); } catch { /* ignore */ }
  }

  // Update DB with local path
  const relPath = `assets/${sanitizedFilename}`;
  await updateProjectField(projectId, {
    source_video: relPath,
    status: "draft",
  });

  const updated = await getProjectById(projectId);
  return NextResponse.json(updated);
}
