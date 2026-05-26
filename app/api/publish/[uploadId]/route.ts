export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getUploadById } from "@/lib/upload-manager";

/**
 * GET /api/publish/[uploadId]
 * Poll the status of a publish job.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ uploadId: string }> }
) {
  const { uploadId } = await params;
  const upload = await getUploadById(uploadId);
  if (!upload) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }
  return NextResponse.json(upload);
}
