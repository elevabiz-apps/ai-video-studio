export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const { filename } = await req.json();

    if (!filename) {
      return NextResponse.json({ error: "Missing filename" }, { status: 400 });
    }

    // Sanitize filename
    const ext = path.extname(filename);
    const baseName = path.basename(filename, ext).replace(/[^a-zA-Z0-9_\-. ]/g, "_");
    const sanitizedFilename = `${baseName}${ext}`;

    // Always use chunked direct upload — no Supabase Storage needed
    return NextResponse.json({ mode: "direct", filename: sanitizedFilename });
  } catch (err) {
    console.error("[upload-url]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
