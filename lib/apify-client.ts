/**
 * Apify API client for scraping social media profiles.
 * Used to analyze competitor/reference accounts.
 *
 * Requires env var: APIFY_API_TOKEN
 *
 * Actors used:
 *   - TikTok: apify/tiktok-scraper
 *   - Instagram: apify/instagram-scraper
 *   - YouTube: streamers/youtube-channel-scraper
 */

const APIFY_BASE = "https://api.apify.com/v2";
const APIFY_TOKEN = () => process.env.APIFY_API_TOKEN ?? "";

export function hasApifyToken(): boolean {
  return !!APIFY_TOKEN();
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ScrapedPost {
  url: string;
  caption: string;
  hook_phrase: string; // first sentence of caption
  duration_seconds: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagement_rate: number;
  hashtags: string[];
  posted_at: string;
  platform: "tiktok" | "instagram" | "youtube";
}

export interface ScrapeResult {
  username: string;
  platform: string;
  follower_count: number;
  posts: ScrapedPost[];
  error?: string;
}

// ─── Actor Execution ─────────────────────────────────────────────────────────

async function runActor(actorId: string, input: Record<string, unknown>): Promise<unknown[]> {
  const token = APIFY_TOKEN();
  if (!token) throw new Error("APIFY_API_TOKEN not configured");

  // Token goes in Authorization header — NOT as a query param — to avoid leaking it in
  // server access logs, proxies, and Referer headers.
  const runRes = await fetch(
    `${APIFY_BASE}/acts/${actorId}/run-sync-get-dataset-items`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(input),
    }
  );

  if (!runRes.ok) {
    const text = await runRes.text();
    throw new Error(`Apify actor ${actorId} failed: ${runRes.status} ${text}`);
  }

  return await runRes.json();
}

// ─── TikTok Scraping ─────────────────────────────────────────────────────────

export async function scrapeTikTokProfile(username: string, maxPosts = 30): Promise<ScrapeResult> {
  const cleanUsername = username.replace(/^@/, "").replace(/https?:\/\/(www\.)?tiktok\.com\/@?/, "").split("/")[0].split("?")[0];

  try {
    const items = await runActor("clockworks/free-tiktok-scraper", {
      profiles: [`https://www.tiktok.com/@${cleanUsername}`],
      resultsPerPage: maxPosts,
      shouldDownloadVideos: false,
    }) as Record<string, unknown>[];

    const posts: ScrapedPost[] = items
      .filter((item) => item.videoUrl || item.webVideoUrl)
      .map((item) => {
        const caption = String(item.text ?? "");
        const views = Number(item.playCount ?? item.plays ?? 0);
        const likes = Number(item.diggCount ?? item.likes ?? 0);
        const comments = Number(item.commentCount ?? item.comments ?? 0);
        const shares = Number(item.shareCount ?? item.shares ?? 0);
        const videoMeta = item.videoMeta as Record<string, unknown> | undefined;
        const duration = Number(item.duration ?? videoMeta?.duration ?? 0);

        return {
          url: String(item.webVideoUrl ?? item.videoUrl ?? ""),
          caption,
          hook_phrase: extractHook(caption),
          duration_seconds: duration,
          views,
          likes,
          comments,
          shares,
          engagement_rate: views > 0 ? ((likes + comments + shares) / views) * 100 : 0,
          hashtags: extractHashtags(caption),
          posted_at: String(item.createTimeISO ?? item.createTime ?? ""),
          platform: "tiktok" as const,
        };
      });

    // Try to extract follower count from the first item's author info
    const firstItem = items[0] as Record<string, unknown> | undefined;
    const authorMeta = firstItem?.authorMeta as Record<string, unknown> | undefined;
    const followerCount = Number(authorMeta?.fans ?? authorMeta?.followers ?? 0);

    return {
      username: cleanUsername,
      platform: "tiktok",
      follower_count: followerCount,
      posts,
    };
  } catch (err) {
    return {
      username: cleanUsername,
      platform: "tiktok",
      follower_count: 0,
      posts: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Instagram Scraping ──────────────────────────────────────────────────────

export async function scrapeInstagramProfile(username: string, maxPosts = 30): Promise<ScrapeResult> {
  const cleanUsername = username.replace(/^@/, "").replace(/https?:\/\/(www\.)?instagram\.com\//, "").split("/")[0].split("?")[0];

  try {
    const items = await runActor("apify/instagram-scraper", {
      directUrls: [`https://www.instagram.com/${cleanUsername}/`],
      resultsType: "posts",
      resultsLimit: maxPosts,
      addParentData: true,
    }) as Record<string, unknown>[];

    const posts: ScrapedPost[] = items
      .filter((item) => item.type === "Video" || item.videoUrl)
      .map((item) => {
        const caption = String(item.caption ?? "");
        const views = Number(item.videoViewCount ?? item.playCount ?? 0);
        const likes = Number(item.likesCount ?? 0);
        const comments = Number(item.commentsCount ?? 0);
        const duration = Number(item.videoDuration ?? 0);

        return {
          url: String(item.url ?? ""),
          caption,
          hook_phrase: extractHook(caption),
          duration_seconds: duration,
          views,
          likes,
          comments,
          shares: 0, // IG doesn't expose share count publicly
          engagement_rate: views > 0 ? ((likes + comments) / views) * 100 : 0,
          hashtags: extractHashtags(caption),
          posted_at: String(item.timestamp ?? ""),
          platform: "instagram" as const,
        };
      });

    // Extract follower count from parent data
    const firstItem = items[0] as Record<string, unknown> | undefined;
    const followerCount = Number(firstItem?.followersCount ?? 0);

    return {
      username: cleanUsername,
      platform: "instagram",
      follower_count: followerCount,
      posts,
    };
  } catch (err) {
    return {
      username: cleanUsername,
      platform: "instagram",
      follower_count: 0,
      posts: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── YouTube Scraping ────────────────────────────────────────────────────────

export async function scrapeYouTubeChannel(channelUrl: string, maxPosts = 30): Promise<ScrapeResult> {
  const cleanUrl = channelUrl.includes("youtube.com") || channelUrl.includes("youtu.be")
    ? channelUrl
    : `https://www.youtube.com/@${channelUrl}`;

  try {
    const items = await runActor("streamers/youtube-channel-scraper", {
      startUrls: [{ url: cleanUrl }],
      maxResults: maxPosts,
      sortBy: "newest",
    }) as Record<string, unknown>[];

    const posts: ScrapedPost[] = items.map((item) => {
      const caption = String(item.title ?? "");
      const views = Number(item.viewCount ?? 0);
      const likes = Number(item.likes ?? 0);
      const comments = Number(item.commentsCount ?? 0);
      const durationStr = String(item.duration ?? "0:00");
      const duration = parseDuration(durationStr);

      return {
        url: String(item.url ?? ""),
        caption,
        hook_phrase: caption, // YouTube title IS the hook
        duration_seconds: duration,
        views,
        likes,
        comments,
        shares: 0,
        engagement_rate: views > 0 ? ((likes + comments) / views) * 100 : 0,
        hashtags: extractHashtags(String(item.description ?? "")),
        posted_at: String(item.date ?? ""),
        platform: "youtube" as const,
      };
    });

    const channelName = String((items[0] as Record<string, unknown>)?.channelName ?? channelUrl);

    return {
      username: channelName,
      platform: "youtube",
      follower_count: 0, // Not always available from video scraping
      posts,
    };
  } catch (err) {
    return {
      username: channelUrl,
      platform: "youtube",
      follower_count: 0,
      posts: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Platform Router ─────────────────────────────────────────────────────────

/**
 * Auto-detect platform from URL and scrape.
 */
export async function scrapeProfile(urlOrUsername: string, maxPosts = 30): Promise<ScrapeResult> {
  const input = urlOrUsername.toLowerCase();

  if (input.includes("tiktok.com") || input.startsWith("@")) {
    return scrapeTikTokProfile(urlOrUsername, maxPosts);
  }
  if (input.includes("instagram.com")) {
    return scrapeInstagramProfile(urlOrUsername, maxPosts);
  }
  if (input.includes("youtube.com") || input.includes("youtu.be")) {
    return scrapeYouTubeChannel(urlOrUsername, maxPosts);
  }

  // Default: try TikTok (most common for short-form)
  return scrapeTikTokProfile(urlOrUsername, maxPosts);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractHook(caption: string): string {
  // First sentence or first 100 chars
  const firstSentence = caption.split(/[.!?\n]/)[0]?.trim() ?? "";
  return firstSentence.slice(0, 120);
}

function extractHashtags(text: string): string[] {
  const matches = text.match(/#[\wÀ-ɏ]+/g);
  return matches ?? [];
}

function parseDuration(str: string): number {
  // "1:23" → 83, "1:02:34" → 3754
  const parts = str.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] ?? 0;
}
