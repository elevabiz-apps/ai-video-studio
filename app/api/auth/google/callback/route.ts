export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/drive-client";

/**
 * GET /api/auth/google/callback
 * OAuth callback — receives the authorization code and exchanges it for tokens.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    // User denied access or there was an error
    const baseUrl = req.nextUrl.origin;
    return NextResponse.redirect(`${baseUrl}/?drive_error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return NextResponse.json({ error: "Missing authorization code" }, { status: 400 });
  }

  try {
    await exchangeCodeForTokens(code);

    // Redirect back to the app with success indicator
    const baseUrl = req.nextUrl.origin;
    return NextResponse.redirect(`${baseUrl}/?drive_connected=true`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[auth/google/callback] Token exchange failed:", msg);

    const baseUrl = req.nextUrl.origin;
    return NextResponse.redirect(`${baseUrl}/?drive_error=${encodeURIComponent(msg)}`);
  }
}
