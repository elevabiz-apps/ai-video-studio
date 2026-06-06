export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { getProjectById, updateProjectField } from "@/lib/db-async";
import { createReadStream, createWriteStream, existsSync, mkdirSync } from "fs";
import { rm } from "fs/promises";
import { pipeline } from "stream/promises";
import path from "path";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), ".studio");
const UPLOAD_TMP = path.join(DATA_DIR, "tmp-uploads");

// Assembles all uploaded chunks into a single video file by STREAMING each part
// into the destination in order (constant memory), then cleans up the temp dir.
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

  const safeId = String(uploadId).replace(/[^a-zA-Z0-9_-]/g, "");
  const partsDir = path.join(UPLOAD_TMP, safeId);

  try {
    // Verify all chunks exist before assembling.
    for (let i = 0; i < totalChunks; i++) {
      if (!existsSync(path.join(partsDir, `part${i}`))) {
        return NextResponse.json({ error: `Missing chunk ${i}` }, { status: 400 });
      }
    }

    // Sanitize filename.
    const ext = path.extname(filename);
    const baseName = path.basename(filename, ext).replace(/[^a-zA-Z0-9_\-. ]/g, "_");
    const sanitizedFilename = `${baseName}${ext}`;

    // Ensure assets directory exists.
    const assetsDir = path.join(process.cwd(), "public", "assets");
    if (!existsSync(assetsDir)) mkdirSync(assetsDir, { recursive: true });

    const outputPath = path.join(assetsDir, sanitizedFilename);
    const writeStream = createWriteStream(outputPath);

    // Concatenate all parts in order by streaming (constant memory).
    for (let i = 0; i < totalChunks; i++) {
      await pipeline(createReadStream(path.join(partsDir, `part${i}`)), writeStream, {
        end: false,
      });
    }
    await new Promise<void>((resolve, reject) => {
      writeStream.on("error", reject);
      writeStream.end(() => resolve());
    });

    // Clean up the whole temp dir for this upload.
    await rm(partsDir, { recursive: true, force: true });

    // Update DB with local path.
    const relPath = `assets/${sanitizedFilename}`;
    await updateProjectField(projectId, {
      source_video: relPath,
      status: "draft",
    });

    const updated = await getProjectById(projectId);
    return NextResponse.json(updated);
  } catch (err) {
    console.error("[upload-assemble]", err);
    return NextResponse.json({ error: "Failed to assemble video" }, { status: 500 });
  }
}
