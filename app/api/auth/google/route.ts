export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getAuthUrl, hasDriveConfig, isDriveAuthenticated, disconnectDrive } from "@/lib/drive-client";

/**
 * GET /api/auth/google
 * Returns the OAuth URL to start Google Drive authentication.
 */
export async function GET() {
  if (!hasDriveConfig()) {
    return NextResponse.json(
      { error: "Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    url: getAuthUrl(),
    authenticated: isDriveAuthenticated(),
  });
}

/**
 * DELETE /api/auth/google
 * Disconnect Google Drive.
 */
export async function DELETE() {
  disconnectDrive();
  return NextResponse.json({ ok: true });
}
