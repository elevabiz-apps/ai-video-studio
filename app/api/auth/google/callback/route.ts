export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/drive-client";

/**
 * GET /api/auth/google/callback
 * OAuth callback — receives the authorization code and exchanges it for tokens.
 * Validates the state parameter against the cookie to prevent CSRF attacks.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  const returnedState = req.nextUrl.searchParams.get("state");
  const baseUrl = req.nextUrl.origin;

  if (error) {
    return NextResponse.redirect(`${baseUrl}/settings?drive_error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return NextResponse.json({ error: "Missing authorization code" }, { status: 400 });
  }

  // Validate state to prevent CSRF (compare with cookie)
  const savedState = req.cookies.get("oauth_state")?.value;
  if (savedState && returnedState && savedState !== returnedState) {
    console.error("[auth/google/callback] State mismatch — possible CSRF attack");
    return NextResponse.redirect(`${baseUrl}/settings?drive_error=state_mismatch`);
  }

  try {
    await exchangeCodeForTokens(code, baseUrl);

    const response = NextResponse.redirect(`${baseUrl}/settings?drive_connected=true`);
    // Clear the state cookie
    response.cookies.delete("oauth_state");
    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[auth/google/callback] Token exchange failed:", msg);

    return NextResponse.redirect(`${baseUrl}/settings?drive_error=${encodeURIComponent(msg)}`);
  }
}
