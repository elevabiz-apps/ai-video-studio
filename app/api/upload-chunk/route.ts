export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";

// Receives one chunk of a multipart video upload.
// Saves it as /tmp/{uploadId}.part{chunkIndex}
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const chunk = formData.get("chunk") as File | null;
  const uploadId = formData.get("uploadId") as string | null;
  const chunkIndex = formData.get("chunkIndex") as string | null;

  if (!chunk || !uploadId || chunkIndex === null) {
    return NextResponse.json({ error: "Missing chunk, uploadId, or chunkIndex" }, { status: 400 });
  }

  const tmpDir = os.tmpdir();
  const chunkPath = path.join(tmpDir, `${uploadId}.part${chunkIndex}`);

  const buffer = Buffer.from(await chunk.arrayBuffer());
  fs.writeFileSync(chunkPath, buffer);

  return NextResponse.json({ ok: true, chunkIndex: Number(chunkIndex), size: buffer.length });
}
