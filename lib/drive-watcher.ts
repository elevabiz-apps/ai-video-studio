/**
 * Drive Watcher — detects new videos in a Google Drive folder
 * and kicks off the auto-processing pipeline.
 *
 * Called by:
 *   - Cron job: GET /api/cron/check-drive (every 5 minutes)
 *   - Webhook: POST /api/webhooks/drive (push notification from Drive)
 */

import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// Max pipelines running simultaneously to prevent OOM on constrained Railway instances
const MAX_CONCURRENT_PIPELINES = 2;
let activePipelines = 0;
import {
  listVideosInFolder,
  downloadFile,
  markFileAsProcessed,
  isDriveAuthenticated,
} from "./drive-client";
import {
  autoConfigQueries,
  driveSyncQueries,
  type AutoConfig,
} from "./db";

// DATA_DIR env var points to a Railway Volume mount (e.g. /app/data).
const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), ".studio");
const ASSETS_DIR = path.join(DATA_DIR, "assets");

export interface SyncResult {
  checked: boolean;
  newFiles: number;
  errors: string[];
}

/**
 * Check all enabled auto-configs for new videos in their Drive folders.
 * Returns a summary of what was found.
 */
export async function checkDriveForNewVideos(): Promise<SyncResult> {
  const result: SyncResult = { checked: false, newFiles: 0, errors: [] };

  if (!isDriveAuthenticated()) {
    result.errors.push("Google Drive not authenticated");
    return result;
  }

  // Get all enabled auto-configs that have a drive folder set
  const configs = autoConfigQueries.getEnabled.all() as AutoConfig[];
  const activeConfigs = configs.filter((c) => c.drive_folder_id);

  if (activeConfigs.length === 0) {
    result.errors.push("No active auto-configs with Drive folder");
    return result;
  }

  result.checked = true;

  for (const config of activeConfigs) {
    try {
      const videos = await listVideosInFolder(config.drive_folder_id!);

      for (const video of videos) {
        // Skip if already in sync log (already detected or processed)
        const existing = driveSyncQueries.getByDriveFileId.get(video.id);
        if (existing) continue;

        // Skip files already marked as processed (filename starts with ✅)
        if (video.name.startsWith("✅")) continue;

        // New file detected! Create sync log entry
        const syncId = randomUUID();
        driveSyncQueries.create.run(syncId, video.id, video.name);
        result.newFiles++;

        // Start download and processing in background (fire-and-forget), respecting concurrency limit
        if (activePipelines >= MAX_CONCURRENT_PIPELINES) {
          console.warn(`[drive-watcher] Concurrency limit (${MAX_CONCURRENT_PIPELINES}) reached. ${video.name} queued as detected.`);
          // Entry is already created with status "detected" — next cron run will retry
        } else {
          activePipelines++;
          downloadAndProcess(syncId, video.id, video.name, config)
            .catch((err) => {
              console.error(`[drive-watcher] Error processing ${video.name}:`, err);
              driveSyncQueries.updateField(syncId, {
                status: "failed",
                error: err instanceof Error ? err.message : String(err),
              });
            })
            .finally(() => { activePipelines--; });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`Folder ${config.drive_folder_id}: ${msg}`);
      console.error(`[drive-watcher] Error checking folder:`, msg);
    }
  }

  return result;
}

/**
 * Download a file from Drive and create a project for it.
 * The actual pipeline processing is triggered via the existing process API.
 */
async function downloadAndProcess(
  syncId: string,
  driveFileId: string,
  filename: string,
  config: AutoConfig
) {
  // Update status to downloading
  driveSyncQueries.updateField(syncId, { status: "downloading" });

  // Ensure assets directory exists
  if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
  }

  // Download file
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const localPath = path.join(ASSETS_DIR, `drive_${Date.now()}_${sanitized}`);
  const stream = await downloadFile(driveFileId);

  await new Promise<void>((resolve, reject) => {
    const ws = fs.createWriteStream(localPath);
    stream.pipe(ws);
    ws.on("finish", resolve);
    ws.on("error", reject);
    stream.on("error", reject);
  });

  console.log(`[drive-watcher] Downloaded ${filename} → ${localPath}`);

  // Determine mode: filename prefix "MC" forces multiclip regardless of config
  let mode = config.default_mode;
  if (/^mc[_\s-]/i.test(filename)) {
    mode = "clips";
    console.log(`[drive-watcher] Filename starts with "MC" → forcing multiclip mode`);
  } else if (mode === "auto") {
    // Auto-detect: use ffprobe to check dimensions
    mode = await detectVideoOrientation(localPath);
  }

  // Create project via internal API
  const projectId = randomUUID();
  const { createProject, updateProjectField } = await import("./db-async");

  const projectName = filename.replace(/\.[^.]+$/, ""); // Remove extension
  await createProject(projectId, projectName, mode);

  // Set the video path relative to public/
  const relativeVideoPath = `assets/${path.basename(localPath)}`;
  await updateProjectField(projectId, {
    source_video: relativeVideoPath,
    original_video: relativeVideoPath,
    caption_preset: config.caption_preset,
  });

  // Link sync entry to project
  driveSyncQueries.updateField(syncId, {
    status: "processing",
    project_id: projectId,
  });

  // Start the processing pipeline
  const { createJob } = await import("./db-async");
  const jobId = randomUUID();
  await createJob(jobId, "process", projectId);

  // Import and run pipeline
  const { spawnPipeline, spawnMultiClipPipeline } = await import("./processing");

  if (mode === "clips") {
    await spawnMultiClipPipeline(jobId, projectId, relativeVideoPath);
  } else {
    await spawnPipeline(jobId, projectId, relativeVideoPath);
  }

  // After pipeline completes, update sync status to pending_review
  // (human approval required before publishing)
  driveSyncQueries.updateField(syncId, { status: "pending_review" });

  // Mark file in Drive as processed
  try {
    await markFileAsProcessed(driveFileId);
  } catch (err) {
    console.warn(`[drive-watcher] Could not mark file as processed in Drive:`, err);
  }

  console.log(`[drive-watcher] Pipeline complete for ${filename}. Awaiting human review.`);
}

/**
 * Auto-detect video orientation using ffprobe.
 * Returns "clips" for horizontal (landscape) videos, "single" for vertical.
 * Uses execFile (async) to avoid blocking the Node.js event loop.
 */
async function detectVideoOrientation(
  filePath: string
): Promise<"single" | "clips"> {
  try {
    const ffprobe = process.env.FFPROBE_PATH ?? "ffprobe";
    const { stdout } = await execFileAsync(
      ffprobe,
      [
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height",
        "-of", "csv=s=x:p=0",
        filePath,
      ],
      { timeout: 10_000 }
    );

    const [w, h] = stdout.trim().split("x").map(Number);
    if (w && h) {
      // Landscape or square → clips mode (will be reframed to 9:16)
      // Portrait → single mode
      return w >= h ? "clips" : "single";
    }
  } catch (err) {
    console.warn("[drive-watcher] ffprobe failed, defaulting to single mode:", err);
  }

  return "single";
}
