export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { hasR2, presignUploadPart } from "@/lib/r2";

// Presigns the URL for ONE multipart part. The browser PUTs the part bytes
// directly to R2 with this URL. Requested per-part so a failed part can be
// re-presigned and retried without restarting the whole upload.
export async function POST(req: NextRequest) {
  if (!hasR2()) {
    return NextResponse.json({ error: "R2 not configured" }, { status: 400 });
  }

  let body: { key?: unknown; uploadId?: unknown; partNumber?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { key, uploadId, partNumber } = body;
  if (
    typeof key !== "string" ||
    typeof uploadId !== "string" ||
    !Number.isInteger(partNumber) ||
    (partNumber as number) < 1 ||
    (partNumber as number) > 10000
  ) {
    return NextResponse.json({ error: "Invalid key, uploadId or partNumber" }, { status: 400 });
  }

  // Key shape is "<projectId>/<filename>" — reject anything that tries to escape.
  if (key.includes("..") || !/^[a-zA-Z0-9_-]+\/[^/]+$/.test(key)) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  try {
    const url = await presignUploadPart(key, uploadId, partNumber as number);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[upload-part-url]", err);
    return NextResponse.json({ error: "Failed to presign part" }, { status: 500 });
  }
}
