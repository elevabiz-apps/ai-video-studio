export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import path from "path";

// Upload parts live on the persistent Railway volume (known free space), NOT in
// os.tmpdir(): on some container runtimes /tmp is tmpfs (RAM-backed), which would
// make accumulating 10MB parts eat into the 512MB memory budget.
const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), ".studio");
const UPLOAD_TMP = path.join(DATA_DIR, "tmp-uploads");

// Receives one chunk of a chunked video upload as a RAW body (octet-stream) and
// STREAMS it straight to disk. Streaming keeps memory ~constant, instead of
// buffering the whole chunk with req.formData() + arrayBuffer() + Buffer.from()
// (three full copies in RAM) which on the 512MB container accumulates across
// chunks until the process is OOM-killed (connection drops → "Error de red").
export async function POST(req: NextRequest) {
  const uploadId = req.nextUrl.searchParams.get("uploadId");
  const chunkIndex = req.nextUrl.searchParams.get("chunkIndex");

  if (!uploadId || chunkIndex === null || !req.body) {
    return NextResponse.json(
      { error: "Missing uploadId, chunkIndex, or body" },
      { status: 400 }
    );
  }

  // Guard against path traversal: only allow safe id chars.
  const safeId = uploadId.replace(/[^a-zA-Z0-9_-]/g, "");
  const idx = Number(chunkIndex);
  if (!safeId || !Number.isInteger(idx) || idx < 0) {
    return NextResponse.json({ error: "Invalid uploadId or chunkIndex" }, { status: 400 });
  }

  try {
    const dir = path.join(UPLOAD_TMP, safeId);
    await mkdir(dir, { recursive: true });
    const chunkPath = path.join(dir, `part${idx}`);

    await pipeline(
      Readable.fromWeb(req.body as Parameters<typeof Readable.fromWeb>[0]),
      createWriteStream(chunkPath)
    );

    return NextResponse.json({ ok: true, chunkIndex: idx });
  } catch (err) {
    console.error("[upload-chunk]", err);
    return NextResponse.json({ error: "Failed to write chunk" }, { status: 500 });
  }
}
