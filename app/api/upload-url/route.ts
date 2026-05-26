export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getProjectById } from "@/lib/db-async";
import { createSignedUploadUrl } from "@/lib/storage";
import { hasSupabase } from "@/lib/supabase-client";
import path from "path";

export async function POST(req: NextRequest) {
  const { projectId, filename } = await req.json();

  if (!projectId || !filename) {
    return NextResponse.json({ error: "Missing projectId or filename" }, { status: 400 });
  }

  const project = await getProjectById(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Sanitize filename
  const ext = path.extname(filename);
  const baseName = path.basename(filename, ext).replace(/[^a-zA-Z0-9_\-. ]/g, "_");
  const sanitizedFilename = `${baseName}${ext}`;

  if (!hasSupabase()) {
    // Local dev: tell client to use the regular upload endpoint
    return NextResponse.json({ mode: "direct", filename: sanitizedFilename });
  }

  try {
    const { signedUrl, storagePath } = await createSignedUploadUrl(projectId, sanitizedFilename);
    return NextResponse.json({
      mode: "supabase",
      signedUrl,
      storagePath,
      filename: sanitizedFilename,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
