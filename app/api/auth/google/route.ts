export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getAuthUrl, hasDriveConfig, isDriveAuthenticated, disconnectDrive } from "@/lib/drive-client";

/**
 * GET /api/auth/google
 * Redirects the browser directly to Google's OAuth consent screen.
 * Generates a random `state` value (required by Google's secure-response-handling
 * policy for CSRF protection) and stores it in a cookie for validation on callback.
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
      url: getAuthUrl(origin, "status-check"),
      authenticated: isDriveAuthenticated(),
    });
  }

  // Generate a cryptographically random state to satisfy Google's
  // secure-response-handling policy and prevent CSRF attacks.
  const state = randomBytes(16).toString("hex");

  const authUrl = getAuthUrl(origin, state);

  // Store state in a short-lived HttpOnly cookie so the callback can validate it
  const response = NextResponse.redirect(authUrl);
  response.cookies.set("oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600, // 10 minutes — enough time to complete the OAuth flow
    path: "/",
  });

  return response;
}

/**
 * DELETE /api/auth/google
 * Disconnect Google Drive.
 */
export async function DELETE() {
  disconnectDrive();
  return NextResponse.json({ ok: true });
}
