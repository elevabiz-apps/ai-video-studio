/**
 * Profile Builder — constructs a ContentProfile from scraped posts or CSV data.
 * Analyzes patterns in successful content to inform AI clip scoring.
 */

import { randomUUID } from "crypto";
import { contentProfileQueries, referencePostQueries, type ContentProfile } from "./db";
import type { ScrapedPost, ScrapeResult } from "./apify-client";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProfileAnalysis {
  niche: string;
  sub_niches: string[];
  optimal_duration_min: number;
  optimal_duration_max: number;
  pacing: "fast" | "medium" | "slow";
  top_hooks: string[];
  top_hashtags: string[];
  best_posting_times: string[];
  avg_views: number;
  avg_engagement_rate: number;
  silence_threshold_db: string;
  silence_min_duration: number;
  caption_preset: string;
  words_per_phrase: number;
}

// ─── Main Functions ──────────────────────────────────────────────────────────

/**
 * Build a content profile from scrape results.
 * Saves the profile and reference posts to DB.
 */
export async function buildProfileFromScrape(
  scrapeResult: ScrapeResult,
  accountId?: string
): Promise<string> {
  const profileId = randomUUID();
  contentProfileQueries.create.run(profileId, accountId ?? null);

  // Save reference posts to DB
  for (const post of scrapeResult.posts) {
    const postId = randomUUID();
    referencePostQueries.create.run(
      postId,
      profileId,
      post.url,
      scrapeResult.username,
      post.platform
    );
    referencePostQueries.updateField(postId, {
      caption: post.caption,
      hook_phrase: post.hook_phrase,
      duration_seconds: post.duration_seconds,
      views: post.views,
      likes: post.likes,
      comments: post.comments,
      shares: post.shares,
      engagement_rate: post.engagement_rate,
      hashtags: JSON.stringify(post.hashtags),
      posted_at: post.posted_at,
    });
  }

  // Analyze posts and build profile
  const analysis = analyzePosts(scrapeResult.posts);

  // Update profile with analysis results
  contentProfileQueries.updateField(profileId, {
    niche: analysis.niche,
    sub_niches: JSON.stringify(analysis.sub_niches),
    optimal_duration_min: analysis.optimal_duration_min,
    optimal_duration_max: analysis.optimal_duration_max,
    pacing: analysis.pacing,
    silence_threshold_db: analysis.silence_threshold_db,
    silence_min_duration: analysis.silence_min_duration,
    caption_preset: analysis.caption_preset,
    words_per_phrase: analysis.words_per_phrase,
    top_hooks: JSON.stringify(analysis.top_hooks),
    top_hashtags: JSON.stringify(analysis.top_hashtags),
    best_posting_times: JSON.stringify(analysis.best_posting_times),
    avg_views: analysis.avg_views,
    avg_engagement_rate: analysis.avg_engagement_rate,
    reference_profiles: JSON.stringify([
      `${scrapeResult.platform}:@${scrapeResult.username}`,
    ]),
    // Store only the lightweight summary — omit full post bodies to keep DB size bounded.
    // Full post data is already persisted in reference_posts table.
    raw_data: JSON.stringify({
      username: scrapeResult.username,
      platform: scrapeResult.platform,
      follower_count: scrapeResult.follower_count,
      post_count: scrapeResult.posts.length,
      scraped_at: new Date().toISOString(),
    }),
  });

  return profileId;
}

/**
 * Build profile from CSV/JSON data (manual upload).
 */
export async function buildProfileFromData(
  posts: ScrapedPost[],
  username: string,
  platform: string,
  accountId?: string
): Promise<string> {
  const scrapeResult: ScrapeResult = {
    username,
    platform,
    follower_count: 0,
    posts,
  };

  return buildProfileFromScrape(scrapeResult, accountId);
}

/**
 * Merge another reference profile into an existing content profile.
 */
export async function addReferenceToProfile(
  profileId: string,
  scrapeResult: ScrapeResult
): Promise<void> {
  const profile = contentProfileQueries.getById.get(profileId) as ContentProfile | undefined;
  if (!profile) throw new Error(`Profile ${profileId} not found`);

  // Save new reference posts
  for (const post of scrapeResult.posts) {
    const postId = randomUUID();
    referencePostQueries.create.run(
      postId,
      profileId,
      post.url,
      scrapeResult.username,
      post.platform
    );
    referencePostQueries.updateField(postId, {
      caption: post.caption,
      hook_phrase: post.hook_phrase,
      duration_seconds: post.duration_seconds,
      views: post.views,
      likes: post.likes,
      comments: post.comments,
      shares: post.shares,
      engagement_rate: post.engagement_rate,
      hashtags: JSON.stringify(post.hashtags),
      posted_at: post.posted_at,
    });
  }

  // Re-analyze with all posts combined
  const allPosts = referencePostQueries.getByProfile.all(profileId) as Array<{
    caption: string;
    hook_phrase: string;
    duration_seconds: number;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    engagement_rate: number;
    hashtags: string;
    posted_at: string;
    platform: string;
  }>;

  const asScrapedPosts: ScrapedPost[] = allPosts.map((p) => ({
    url: "",
    caption: p.caption ?? "",
    hook_phrase: p.hook_phrase ?? "",
    duration_seconds: p.duration_seconds ?? 0,
    views: p.views ?? 0,
    likes: p.likes ?? 0,
    comments: p.comments ?? 0,
    shares: p.shares ?? 0,
    engagement_rate: p.engagement_rate ?? 0,
    hashtags: safeParseArray(p.hashtags),
    posted_at: p.posted_at ?? "",
    platform: (p.platform ?? "tiktok") as "tiktok" | "instagram" | "youtube",
  }));

  const analysis = analyzePosts(asScrapedPosts);

  // Update existing reference_profiles list
  const existingRefs = safeParseArray(profile.reference_profiles);
  const newRef = `${scrapeResult.platform}:@${scrapeResult.username}`;
  if (!existingRefs.includes(newRef)) existingRefs.push(newRef);

  contentProfileQueries.updateField(profileId, {
    niche: analysis.niche,
    sub_niches: JSON.stringify(analysis.sub_niches),
    optimal_duration_min: analysis.optimal_duration_min,
    optimal_duration_max: analysis.optimal_duration_max,
    pacing: analysis.pacing,
    top_hooks: JSON.stringify(analysis.top_hooks),
    top_hashtags: JSON.stringify(analysis.top_hashtags),
    best_posting_times: JSON.stringify(analysis.best_posting_times),
    avg_views: analysis.avg_views,
    avg_engagement_rate: analysis.avg_engagement_rate,
    reference_profiles: JSON.stringify(existingRefs),
  });
}

/**
 * Get a formatted context string for the AI clip scoring prompt.
 */
export function getProfileContext(profile: ContentProfile): string {
  const hooks = safeParseArray(profile.top_hooks);
  const hashtags = safeParseArray(profile.top_hashtags);
  const postingTimes = safeParseArray(profile.best_posting_times);

  const lines: string[] = [];

  lines.push(`CONTEXTO DE LA CUENTA:`);

  if (profile.niche) {
    const subNiches = safeParseArray(profile.sub_niches);
    lines.push(`- Nicho: ${profile.niche}${subNiches.length ? ` (${subNiches.join(", ")})` : ""}`);
  }

  lines.push(`- Duración óptima de clips: ${profile.optimal_duration_min}-${profile.optimal_duration_max}s`);
  lines.push(`- Ritmo de edición: ${profile.pacing}`);

  if (profile.avg_engagement_rate) {
    lines.push(`- Engagement rate promedio: ${profile.avg_engagement_rate.toFixed(2)}%`);
  }

  if (profile.avg_views) {
    lines.push(`- Views promedio: ${profile.avg_views.toLocaleString()}`);
  }

  if (hooks.length > 0) {
    lines.push(`\nHOOKS QUE FUNCIONAN EN ESTA CUENTA:`);
    hooks.slice(0, 8).forEach((h, i) => {
      lines.push(`${i + 1}. "${h}"`);
    });
  }

  if (hashtags.length > 0) {
    lines.push(`\nHASHTAGS EFECTIVOS: ${hashtags.slice(0, 10).join(" ")}`);
  }

  if (postingTimes.length > 0) {
    lines.push(`\nMEJORES HORAS DE PUBLICACIÓN: ${postingTimes.join(", ")}`);
  }

  return lines.join("\n");
}

// ─── Analysis Engine ─────────────────────────────────────────────────────────

function analyzePosts(posts: ScrapedPost[]): ProfileAnalysis {
  if (posts.length === 0) {
    return defaultAnalysis();
  }

  // Sort by engagement rate to identify top performers
  const sorted = [...posts].sort((a, b) => b.engagement_rate - a.engagement_rate);
  const topCount = Math.max(1, Math.ceil(posts.length * 0.2)); // top 20%
  const topPosts = sorted.slice(0, topCount);

  // Duration analysis (from top performers)
  const durations = topPosts
    .map((p) => p.duration_seconds)
    .filter((d) => d > 0);
  const avgDuration = mean(durations);
  const optimalMin = Math.max(10, Math.floor(percentile(durations, 0.25)));
  const optimalMax = Math.min(120, Math.ceil(percentile(durations, 0.75)));

  // Pacing from average duration
  let pacing: "fast" | "medium" | "slow" = "medium";
  if (avgDuration < 25) pacing = "fast";
  else if (avgDuration > 45) pacing = "slow";

  // Top hooks (from high-performing posts)
  const topHooks = topPosts
    .map((p) => p.hook_phrase)
    .filter((h) => h.length > 5);

  // Hashtag frequency analysis
  const hashtagCounts = new Map<string, number>();
  for (const post of posts) {
    for (const tag of post.hashtags) {
      const lower = tag.toLowerCase();
      hashtagCounts.set(lower, (hashtagCounts.get(lower) ?? 0) + 1);
    }
  }
  const topHashtags = [...hashtagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([tag]) => tag);

  // Best posting times
  const hourCounts = new Map<number, { count: number; totalER: number }>();
  for (const post of posts) {
    if (!post.posted_at) continue;
    try {
      const hour = new Date(post.posted_at).getHours();
      const existing = hourCounts.get(hour) ?? { count: 0, totalER: 0 };
      hourCounts.set(hour, {
        count: existing.count + 1,
        totalER: existing.totalER + post.engagement_rate,
      });
    } catch { /* skip invalid dates */ }
  }
  const bestHours = [...hourCounts.entries()]
    .map(([hour, data]) => ({ hour, avgER: data.totalER / data.count }))
    .sort((a, b) => b.avgER - a.avgER)
    .slice(0, 3)
    .map((h) => `${h.hour}:00`);

  // Engagement stats
  const avgViews = Math.round(mean(posts.map((p) => p.views)));
  const avgER = mean(posts.map((p) => p.engagement_rate));

  // Niche detection (basic — from common hashtags and caption patterns)
  const niche = detectNiche(topHashtags, posts.map((p) => p.caption));

  // Editing parameters based on pacing
  const silenceThreshold = pacing === "fast" ? "-35dB" : pacing === "slow" ? "-25dB" : "-30dB";
  const silenceMinDuration = pacing === "fast" ? 0.3 : pacing === "slow" ? 0.8 : 0.5;
  const wordsPerPhrase = pacing === "fast" ? 4 : pacing === "slow" ? 7 : 6;
  const captionPreset = "impacto_rosa";

  return {
    niche: niche.main,
    sub_niches: niche.subs,
    optimal_duration_min: optimalMin,
    optimal_duration_max: optimalMax,
    pacing,
    top_hooks: topHooks,
    top_hashtags: topHashtags,
    best_posting_times: bestHours,
    avg_views: avgViews,
    avg_engagement_rate: Math.round(avgER * 100) / 100,
    silence_threshold_db: silenceThreshold,
    silence_min_duration: silenceMinDuration,
    caption_preset: captionPreset,
    words_per_phrase: wordsPerPhrase,
  };
}

function defaultAnalysis(): ProfileAnalysis {
  return {
    niche: "general",
    sub_niches: [],
    optimal_duration_min: 20,
    optimal_duration_max: 60,
    pacing: "medium",
    top_hooks: [],
    top_hashtags: [],
    best_posting_times: [],
    avg_views: 0,
    avg_engagement_rate: 0,
    silence_threshold_db: "-30dB",
    silence_min_duration: 0.5,
    caption_preset: "impacto_rosa",
    words_per_phrase: 6,
  };
}

// ─── Niche Detection ─────────────────────────────────────────────────────────

const NICHE_KEYWORDS: Record<string, string[]> = {
  fitness: ["gym", "workout", "fitness", "ejercicio", "entrenamiento", "rutina", "cardio", "fuerza"],
  educación: ["aprender", "explicar", "dato", "sabías", "educación", "estudio", "ciencia"],
  humor: ["comedia", "gracioso", "humor", "chiste", "meme", "jaja", "risa"],
  negocios: ["emprender", "negocio", "dinero", "inversión", "startup", "marketing", "ventas"],
  cocina: ["receta", "cocina", "cocinar", "comida", "ingrediente", "plato"],
  tech: ["tech", "tecnología", "programación", "código", "software", "ia", "ai", "desarrollo"],
  belleza: ["maquillaje", "makeup", "skincare", "beauty", "belleza", "piel", "cabello"],
  viajes: ["viaje", "travel", "destino", "explorar", "aventura", "turismo"],
  lifestyle: ["lifestyle", "vida", "rutina", "motivación", "bienestar"],
  gaming: ["gaming", "gamer", "juego", "gameplay", "twitch", "stream"],
};

function detectNiche(
  hashtags: string[],
  captions: string[]
): { main: string; subs: string[] } {
  const scores = new Map<string, number>();

  const allText = [
    ...hashtags.map((h) => h.toLowerCase()),
    ...captions.map((c) => c.toLowerCase()),
  ].join(" ");

  for (const [niche, keywords] of Object.entries(NICHE_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      const regex = new RegExp(kw, "gi");
      const matches = allText.match(regex);
      if (matches) score += matches.length;
    }
    if (score > 0) scores.set(niche, score);
  }

  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);

  if (sorted.length === 0) return { main: "general", subs: [] };

  return {
    main: sorted[0][0],
    subs: sorted.slice(1, 4).map(([niche]) => niche),
  };
}

// ─── Math Helpers ────────────────────────────────────────────────────────────

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(p * (sorted.length - 1));
  return sorted[idx];
}

function safeParseArray(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
