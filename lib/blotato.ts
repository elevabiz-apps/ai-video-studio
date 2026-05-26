/**
 * Blotato REST API client — https://backend.blotato.com/v2
 *
 * Auth:       header "blotato-api-key: <key>"
 * Rate limit: 30 req/min
 *
 * Platforms supported by Blotato:
 *   tiktok | instagram | youtube | twitter | linkedin | facebook | pinterest
 */

const BASE_URL = "https://backend.blotato.com/v2";

export type BlotatoPlatform =
  | "tiktok"
  | "instagram"
  | "youtube"
  | "twitter"
  | "linkedin"
  | "facebook"
  | "pinterest";

export type BlotatoAccount = {
  id: string;
  platform: BlotatoPlatform;
  username: string;
  avatar_url?: string;
};

export type BlotatoMediaUpload = {
  media_id: string;
  url: string;
};

export type BlotatoPostResult = {
  post_id: string;
  status: "scheduled" | "published" | "failed";
  url?: string;
  scheduled_at?: string;
  error?: string;
};

export type BlotatoPostStatus = {
  post_id: string;
  status: "pending" | "processing" | "scheduled" | "published" | "failed";
  url?: string;
  error?: string;
};

function getApiKey(): string {
  const key = process.env.BLOTATO_API_KEY;
  if (!key) throw new Error("BLOTATO_API_KEY env var is not set");
  return key;
}

async function blotatoFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "blotato-api-key": getApiKey(),
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    let detail = "";
    try { detail = await res.text(); } catch { /* ignore */ }
    throw new Error(`Blotato API error ${res.status}: ${detail}`);
  }

  return res.json() as Promise<T>;
}

/**
 * Fetch the list of social accounts connected to this Blotato workspace.
 */
export async function getConnectedAccounts(): Promise<BlotatoAccount[]> {
  const data = await blotatoFetch<{ accounts: BlotatoAccount[] }>("/accounts");
  return data.accounts ?? [];
}

/**
 * Upload a video file to Blotato's media storage.
 * Returns a media_id to reference in createPost().
 *
 * Blotato expects a multipart/form-data upload with the video file.
 */
export async function uploadMedia(
  fileBuffer: Buffer,
  filename: string,
  mimeType: string = "video/mp4"
): Promise<BlotatoMediaUpload> {
  const formData = new FormData();
  const blob = new Blob([fileBuffer], { type: mimeType });
  formData.append("file", blob, filename);

  return blotatoFetch<BlotatoMediaUpload>("/media/upload", {
    method: "POST",
    body: formData,
    // Don't set Content-Type — let fetch set it with boundary for multipart
  });
}

/**
 * Create a post (publish or schedule) across one or more platforms.
 */
export async function createPost(params: {
  mediaIds: string[];
  caption: string;
  platforms: BlotatoPlatform[];
  scheduledAt?: Date;
  accountIds?: string[];
}): Promise<BlotatoPostResult[]> {
  const body = {
    media_ids: params.mediaIds,
    caption: params.caption,
    platforms: params.platforms,
    ...(params.scheduledAt
      ? { scheduled_at: params.scheduledAt.toISOString() }
      : {}),
    ...(params.accountIds?.length
      ? { account_ids: params.accountIds }
      : {}),
  };

  const data = await blotatoFetch<{ posts: BlotatoPostResult[] }>("/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return data.posts ?? [];
}

/**
 * Poll the status of a previously created post.
 */
export async function getPostStatus(postId: string): Promise<BlotatoPostStatus> {
  return blotatoFetch<BlotatoPostStatus>(`/posts/${postId}`);
}

/**
 * Check if the API key is configured and the connection works.
 */
export function hasBlotatoKey(): boolean {
  return !!process.env.BLOTATO_API_KEY;
}
