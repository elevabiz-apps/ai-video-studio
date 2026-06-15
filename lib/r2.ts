/**
 * Cloudflare R2 (S3-compatible) helpers for large video uploads.
 *
 * The browser uploads videos DIRECTLY to R2 via presigned multipart URLs, so a
 * 600MB+ file never touches the app server's disk (which is small and was the
 * cause of the "error de red" mid-upload). The pipeline later downloads the
 * object BY STREAM to local disk for ffmpeg — never buffered fully in memory
 * (a 600MB Buffer would OOM the 512MB container).
 *
 * R2 free tier: 10GB storage + $0 egress, so downloading for processing is free.
 *
 * Activates only when the R2_* env vars are set; otherwise the app falls back to
 * the legacy chunk-to-volume upload (see hasR2()).
 */
import {
  S3Client,
  CreateMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  UploadPartCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import type { Readable } from "stream";

let _client: S3Client | null = null;

/** True when all R2 env vars are present (otherwise: legacy volume upload). */
export function hasR2(): boolean {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET
  );
}

function bucket(): string {
  const b = process.env.R2_BUCKET;
  if (!b) throw new Error("R2_BUCKET must be set");
  return b;
}

function client(): S3Client {
  if (_client) return _client;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY must be set");
  }
  // Accept either the full endpoint URL or just the account ID
  const endpoint = accountId.startsWith("https://")
    ? accountId
    : `https://${accountId}.r2.cloudflarestorage.com`;
  _client = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
  return _client;
}

// 1h to upload a single part — generous for a 10MB part on a slow connection.
const PART_URL_TTL = 60 * 60;

export type CompletedPart = { PartNumber: number; ETag: string };

export async function createMultipartUpload(key: string): Promise<string> {
  const res = await client().send(
    new CreateMultipartUploadCommand({ Bucket: bucket(), Key: key })
  );
  if (!res.UploadId) throw new Error("R2 did not return an UploadId");
  return res.UploadId;
}

/** Presigned URL the browser PUTs one part to, directly to R2. */
export async function presignUploadPart(
  key: string,
  uploadId: string,
  partNumber: number
): Promise<string> {
  return getSignedUrl(
    client(),
    new UploadPartCommand({
      Bucket: bucket(),
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    }),
    { expiresIn: PART_URL_TTL }
  );
}

export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: CompletedPart[]
): Promise<void> {
  await client().send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket(),
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: [...parts].sort((a, b) => a.PartNumber - b.PartNumber),
      },
    })
  );
}

export async function abortMultipartUpload(key: string, uploadId: string): Promise<void> {
  try {
    await client().send(
      new AbortMultipartUploadCommand({ Bucket: bucket(), Key: key, UploadId: uploadId })
    );
  } catch {
    /* best effort — an aborted/expired multipart is auto-reaped by R2 lifecycle */
  }
}

/** Stream an R2 object to a local file. Constant memory — never buffers the
 *  whole video, so a 600MB download won't OOM the container. */
export async function downloadToFile(key: string, localPath: string): Promise<void> {
  const res = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  if (!res.Body) throw new Error(`R2 object ${key} has no body`);
  await pipeline(res.Body as Readable, createWriteStream(localPath));
}

export async function deleteObject(key: string): Promise<void> {
  try {
    await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
  } catch {
    /* best effort */
  }
}
