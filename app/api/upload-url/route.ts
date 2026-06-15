export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { hasR2, createMultipartUpload } from "@/lib/r2";

export async function POST(req: NextRequest) {
  try {
    const { projectId, filename } = await req.json();

    if (!filename) {
      return NextResponse.json({ error: "Missing filename" }, { status: 400 });
    }

    // Sanitize filename
    const ext = path.extname(filename);
    const baseName = path.basename(filename, ext).replace(/[^a-zA-Z0-9_\-. ]/g, "_");
    const sanitizedFilename = `${baseName}${ext}`;

    // Preferred path: direct-to-R2 multipart upload (browser → R2, never touches
    // the app server's disk — which is small and caused the mid-upload "error de
    // red" on large files). Falls back to chunk-to-volume when R2 isn't set up.
    if (hasR2()) {
      if (!projectId) {
        return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
      }
      const safeProject = String(projectId).replace(/[^a-zA-Z0-9_-]/g, "");
      const key = `${safeProject}/${sanitizedFilename}`;
      const uploadId = await createMultipartUpload(key);
      return NextResponse.json({ mode: "r2", key, uploadId, filename: sanitizedFilename });
    }

    // Legacy: chunked direct upload to the server volume.
    return NextResponse.json({ mode: "direct", filename: sanitizedFilename });
  } catch (err) {
    console.error("[upload-url]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
