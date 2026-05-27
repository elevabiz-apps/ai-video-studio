export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { contentProfileQueries, referencePostQueries, type ContentProfile, type ReferencePost } from "@/lib/db";

/**
 * GET /api/references
 * List all content profiles with their reference posts.
 * Query: ?profileId=xxx for a specific profile.
 */
export async function GET(req: NextRequest) {
  const profileId = req.nextUrl.searchParams.get("profileId");

  if (profileId) {
    const profile = contentProfileQueries.getById.get(profileId) as ContentProfile | undefined;
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    const posts = referencePostQueries.getByProfile.all(profileId) as ReferencePost[];
    return NextResponse.json({ profile, posts });
  }

  const profiles = contentProfileQueries.getAll.all() as ContentProfile[];
  return NextResponse.json({ profiles });
}

/**
 * DELETE /api/references?profileId=xxx
 * Delete a content profile and all its reference posts.
 */
export async function DELETE(req: NextRequest) {
  const profileId = req.nextUrl.searchParams.get("profileId");
  if (!profileId) {
    return NextResponse.json({ error: "Missing profileId" }, { status: 400 });
  }

  referencePostQueries.deleteByProfile.run(profileId);
  contentProfileQueries.delete.run(profileId);
  return NextResponse.json({ ok: true });
}
