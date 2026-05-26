export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getConnectedAccounts, hasBlotatoKey } from "@/lib/blotato";

/**
 * GET /api/publish/accounts
 * Returns the list of social accounts connected in Blotato.
 */
export async function GET() {
  if (!hasBlotatoKey()) {
    return NextResponse.json({ accounts: [], configured: false });
  }

  try {
    const accounts = await getConnectedAccounts();
    return NextResponse.json({ accounts, configured: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[publish/accounts] Error fetching accounts:", msg);
    return NextResponse.json({ accounts: [], configured: true, error: msg });
  }
}
