export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { listFolders, isDriveAuthenticated } from "@/lib/drive-client";

/**
 * GET /api/drive/folders?parentId=xxx
 * List folders in Google Drive for the folder picker UI.
 */
export async function GET(req: NextRequest) {
  if (!isDriveAuthenticated()) {
    return NextResponse.json({ error: "Google Drive not connected" }, { status: 401 });
  }

  const parentId = req.nextUrl.searchParams.get("parentId") ?? undefined;

  try {
    const folders = await listFolders(parentId);
    return NextResponse.json({ folders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
