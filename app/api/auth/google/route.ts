export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUrl, hasDriveConfig, isDriveAuthenticated, disconnectDrive } from "@/lib/drive-client";

/**
 * GET /api/auth/google
 * Redirects the browser directly to Google's OAuth consent screen.
 * Uses the request origin to build the correct redirect_uri for any environment.
 *
 * Query param ?json=1 returns JSON instead of redirecting (for status checks).
 */
export async function GET(req: NextRequest) {
  if (!hasDriveConfig()) {
    return NextResponse.json(
      { error: "Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." },
      { status: 500 }
    );
  }

  const origin = req.nextUrl.origin;
  const isJsonRequest = req.nextUrl.searchParams.get("json") === "1";

  // Status-only check (called from UI to show connected/disconnected badge)
  if (isJsonRequest) {
    return NextResponse.json({
      url: getAuthUrl(origin),
      authenticated: isDriveAuthenticated(),
    });
  }

  // Redirect browser directly to Google OAuth
  const authUrl = getAuthUrl(origin);
  return NextResponse.redirect(authUrl);
}

/**
 * DELETE /api/auth/google
 * Disconnect Google Drive.
 */
export async function DELETE() {
  disconnectDrive();
  return NextResponse.json({ ok: true });
}
