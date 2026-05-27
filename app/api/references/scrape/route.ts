export const dynamic = "force-dynamic";
// Apify actors in cold-start can take 3-4 minutes for 30 posts.
// 300s is the Railway/Next.js max for long-running routes.
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { scrapeProfile, hasApifyToken } from "@/lib/apify-client";
import { buildProfileFromScrape, addReferenceToProfile } from "@/lib/profile-builder";

/**
 * POST /api/references/scrape
 * Scrape a social media profile and build/update a content profile.
 *
 * Body: {
 *   url: string;           // Profile URL or @username
 *   profileId?: string;    // If provided, adds to existing profile. Otherwise creates new.
 *   accountId?: string;    // Link to a social_accounts entry
 *   maxPosts?: number;     // How many posts to scrape (default 30)
 * }
 */
export async function POST(req: NextRequest) {
  if (!hasApifyToken()) {
    return NextResponse.json(
      { error: "APIFY_API_TOKEN not configured. Set it in your environment variables." },
      { status: 500 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { url, profileId, accountId, maxPosts } = body as {
    url?: string;
    profileId?: string;
    accountId?: string;
    maxPosts?: number;
  };

  if (!url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  try {
    const result = await scrapeProfile(url, maxPosts ?? 30);

    if (result.error) {
      return NextResponse.json(
        { error: `Scraping failed: ${result.error}`, partial: result },
        { status: 500 }
      );
    }

    if (result.posts.length === 0) {
      return NextResponse.json(
        { error: "No video posts found for this profile", result },
        { status: 404 }
      );
    }

    let resultProfileId: string;

    if (profileId) {
      // Add reference to existing profile
      await addReferenceToProfile(profileId, result);
      resultProfileId = profileId;
    } else {
      // Create new profile
      resultProfileId = await buildProfileFromScrape(result, accountId);
    }

    return NextResponse.json({
      profileId: resultProfileId,
      username: result.username,
      platform: result.platform,
      postsScraped: result.posts.length,
      followerCount: result.follower_count,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[references/scrape] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
