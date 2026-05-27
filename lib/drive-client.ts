/**
 * Google Drive API client.
 * Handles OAuth, file listing, downloading, and webhook registration.
 *
 * Requires env vars:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
 */

import { google, type drive_v3 } from "googleapis";
import { googleTokenQueries } from "./db";
import type { Readable } from "stream";

// ─── Config ──────────────────────────────────────────────────────────────────

const CLIENT_ID = () => process.env.GOOGLE_CLIENT_ID ?? "";
const CLIENT_SECRET = () => process.env.GOOGLE_CLIENT_SECRET ?? "";
const REDIRECT_URI = (origin?: string) => {
  // Explicit env var always wins
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  // If called with the request origin (production), build it from there
  if (origin) return `${origin}/api/auth/google/callback`;
  // Fallback for local dev
  return "http://localhost:3001/api/auth/google/callback";
};

// Scopes needed:
//   drive.readonly → list and download files the user owns/shared with them
// NOTE: We intentionally request only ONE scope to keep OAuth consent screen setup
// as simple as possible. Processed files are tracked via the drive_sync_log DB table
// (not by renaming them in Drive), so no write access is needed.
const SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
];

// ─── OAuth2 Client ───────────────────────────────────────────────────────────

function createOAuth2Client(origin?: string) {
  return new google.auth.OAuth2(CLIENT_ID(), CLIENT_SECRET(), REDIRECT_URI(origin));
}

/**
 * Generate the Google OAuth consent URL.
 * Pass `origin` (e.g. "https://myapp.railway.app") to build the correct redirect_uri
 * dynamically when GOOGLE_REDIRECT_URI is not set.
 */
export function getAuthUrl(origin?: string, state?: string): string {
  const client = createOAuth2Client(origin);
  return client.generateAuthUrl({
    access_type: "offline", // get refresh_token
    prompt: "consent",
    scope: SCOPES,
    // state is required by Google's OAuth 2.0 secure-response-handling policy (CSRF protection)
    state: state ?? "drive-auth",
  });
}

/**
 * Exchange an authorization code for tokens and persist them.
 */
export async function exchangeCodeForTokens(code: string, origin?: string) {
  const client = createOAuth2Client(origin);
  const { tokens } = await client.getToken(code);

  googleTokenQueries.upsert({
    access_token: tokens.access_token!,
    refresh_token: tokens.refresh_token ?? null,
    token_type: tokens.token_type ?? "Bearer",
    expiry_date: tokens.expiry_date ?? null,
  });

  return tokens;
}

/**
 * Get an authenticated Drive client using stored tokens.
 * Auto-refreshes if the access token has expired.
 */
export async function getAuthenticatedDrive(): Promise<drive_v3.Drive> {
  const stored = googleTokenQueries.get.get();
  if (!stored) throw new Error("Google not authenticated. Please connect Google Drive first.");

  const client = createOAuth2Client();
  client.setCredentials({
    access_token: stored.access_token,
    refresh_token: stored.refresh_token,
    token_type: stored.token_type,
    expiry_date: stored.expiry_date ?? undefined,
  });

  // Listen for token refresh events and persist new tokens
  client.on("tokens", (tokens) => {
    googleTokenQueries.upsert({
      access_token: tokens.access_token!,
      refresh_token: tokens.refresh_token ?? null,
      token_type: tokens.token_type ?? "Bearer",
      expiry_date: tokens.expiry_date ?? null,
    });
  });

  return google.drive({ version: "v3", auth: client });
}

/**
 * Check if Google Drive is authenticated.
 */
export function isDriveAuthenticated(): boolean {
  try {
    const stored = googleTokenQueries.get.get();
    return !!stored?.access_token;
  } catch {
    return false;
  }
}

/**
 * Disconnect Google Drive (delete stored tokens).
 */
export function disconnectDrive(): void {
  googleTokenQueries.delete.run();
}

// ─── File Operations ─────────────────────────────────────────────────────────

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdTime: string;
  modifiedTime: string;
}

/**
 * List video files in a specific Drive folder.
 * Only returns mp4/mov/avi/mkv/webm files.
 */
export async function listVideosInFolder(folderId: string): Promise<DriveFile[]> {
  const drive = await getAuthenticatedDrive();

  const videoMimes = [
    "video/mp4",
    "video/quicktime",
    "video/x-msvideo",
    "video/x-matroska",
    "video/webm",
    "video/mpeg",
  ];

  const mimeQuery = videoMimes.map((m) => `mimeType='${m}'`).join(" or ");
  const query = `'${folderId}' in parents and (${mimeQuery}) and trashed = false`;

  const res = await drive.files.list({
    q: query,
    fields: "files(id, name, mimeType, size, createdTime, modifiedTime)",
    orderBy: "createdTime desc",
    pageSize: 50,
  });

  return (res.data.files ?? []).map((f) => ({
    id: f.id!,
    name: f.name!,
    mimeType: f.mimeType!,
    size: parseInt(f.size ?? "0", 10),
    createdTime: f.createdTime!,
    modifiedTime: f.modifiedTime!,
  }));
}

/**
 * List folders in the user's Drive root (for folder picker UI).
 */
export async function listFolders(parentId?: string): Promise<{ id: string; name: string }[]> {
  const drive = await getAuthenticatedDrive();

  const parent = parentId ?? "root";
  const query = `'${parent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed = false`;

  const res = await drive.files.list({
    q: query,
    fields: "files(id, name)",
    orderBy: "name",
    pageSize: 100,
  });

  return (res.data.files ?? []).map((f) => ({
    id: f.id!,
    name: f.name!,
  }));
}

/**
 * Download a file from Drive as a readable stream.
 */
export async function downloadFile(fileId: string): Promise<Readable> {
  const drive = await getAuthenticatedDrive();

  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "stream" }
  );

  return res.data as unknown as Readable;
}

/**
 * Get file metadata.
 */
export async function getFileMetadata(fileId: string): Promise<DriveFile> {
  const drive = await getAuthenticatedDrive();

  const res = await drive.files.get({
    fileId,
    fields: "id, name, mimeType, size, createdTime, modifiedTime",
  });

  return {
    id: res.data.id!,
    name: res.data.name!,
    mimeType: res.data.mimeType!,
    size: parseInt(res.data.size ?? "0", 10),
    createdTime: res.data.createdTime!,
    modifiedTime: res.data.modifiedTime!,
  };
}

/**
 * Mark a file as processed.
 * Previously renamed the file in Drive (required drive.metadata scope).
 * Now a no-op: processed files are tracked exclusively via drive_sync_log in the DB,
 * which is the primary deduplication check in drive-watcher.ts (line ~72).
 * This keeps OAuth to drive.readonly only — no write permissions needed.
 */
export async function markFileAsProcessed(_fileId: string): Promise<void> {
  // Tracking is handled by drive_sync_log DB table — no Drive API call needed.
}

/**
 * Check if Google Drive credentials are configured (env vars present).
 */
export function hasDriveConfig(): boolean {
  return !!(CLIENT_ID() && CLIENT_SECRET());
}
