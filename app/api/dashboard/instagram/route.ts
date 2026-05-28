export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { contentProfileQueries, referencePostQueries, type ContentProfile, type ReferencePost } from "@/lib/db";
import { hasApifyToken } from "@/lib/apify-client";

export async function GET() {
  const primary = contentProfileQueries.getPrimary.get() as ContentProfile | undefined;

  if (!primary) {
    return NextResponse.json({
      profile: null,
      posts: [],
      apifyConnected: hasApifyToken(),
    });
  }

  const posts = referencePostQueries.getByProfile.all(primary.id) as ReferencePost[];

  return NextResponse.json({
    profile: primary,
    posts,
    apifyConnected: hasApifyToken(),
  });
}
