export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { projectQueries, clipQueries, renderQueries, type Project, type Clip, type Render } from "@/lib/db";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), ".studio");
const ASSETS_DIR = path.join(DATA_DIR, "assets");

// Temp files (.wav, large intermediate videos) are deleted as soon as the
// project is processed. Clip outputs are kept indefinitely.
const TEMP_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2h fallback for orphaned temps

/**
 * GET /api/cron/cleanup
 *
 * Aggressively cleans up disk space on the Railway volume:
 *
 * 1. For every project with status ready/rendered/failed:
 *    - Deletes the original source video (largest file)
 *    - Deletes the silence-removed intermediate (_procesado, _vertical)
 *    - KEEPS clip output files (clip01, clip02, ...) and render outputs
 *
 * 2. Orphan sweep — regardless of project status, deletes:
 *    - audio.wav / *.wav files older than 2h
 *    - _procesado.mp4 files older than 2h
 *    - _vertical.mp4 files older than 2h
 *    - drive_* source files that have been processed (not linked to any project source)
 */
export async function GET() {
  const results: { deleted: string[]; skipped: string[]; errors: string[]; freedMB: number } = {
    deleted: [],
    skipped: [],
    errors: [],
    freedMB: 0,
  };

  try {
    if (!fs.existsSync(ASSETS_DIR)) {
      return NextResponse.json({ message: "Assets directory does not exist", results });
    }

    // ── Step 1: Collect files that must be KEPT ──────────────────────────────
    const clips = clipQueries.getAll?.all?.() as Clip[] ?? [];
    const renders = renderQueries.getAll?.all?.() as Render[] ?? [];
    const projects = projectQueries.getAll.all() as Project[];

    const keepFiles = new Set<string>();

    // Keep clip and render output files
    for (const clip of clips) {
      if (clip.output_path) keepFiles.add(path.basename(clip.output_path));
    }
    for (const render of renders) {
      if (render.output_path) keepFiles.add(path.basename(render.output_path));
    }

    // Keep original_video files from ALL projects — they are needed for re-processing.
    // Deleting them breaks re-process: the pipeline uses original_video as the input
    // for analyze, silence detection, and cut, and there's no way to recover it without
    // re-uploading from Drive.
    for (const project of projects) {
      if (project.original_video) keepFiles.add(path.basename(project.original_video));
    }

    // ── Step 2: Collect INTERMEDIATE files from done projects (safe to delete) ──
    // Only delete source_video (processed intermediates like _procesado, _vertical).
    // original_video is protected above — never deleted.
    const doneProjects = projects.filter(
      (p) => p.status === "ready" || p.status === "rendered" || p.status === "failed"
    );

    const deleteFromProjects = new Set<string>();
    for (const project of doneProjects) {
      // original_video is intentionally excluded — it's in keepFiles
      if (project.source_video) {
        const base = path.basename(project.source_video);
        // Double-check: don't add if it's also an original_video of any project
        if (!keepFiles.has(base)) {
          deleteFromProjects.add(base);
        }
      }
    }

    // ── Step 3: Scan and delete ───────────────────────────────────────────────
    const now = Date.now();
    const files = fs.readdirSync(ASSETS_DIR);

    for (const file of files) {
      const filePath = path.join(ASSETS_DIR, file);

      try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) continue;

        const age = now - stat.mtimeMs;

        // Never delete clip/render output files
        if (keepFiles.has(file)) {
          results.skipped.push(`${file} (clip/render output — keeping)`);
          continue;
        }

        // Delete source/intermediate files belonging to finished projects
        if (deleteFromProjects.has(file)) {
          results.freedMB += stat.size / (1024 * 1024);
          fs.unlinkSync(filePath);
          results.deleted.push(file);
          continue;
        }

        // Orphan sweep: delete temp files older than TEMP_MAX_AGE_MS
        const isTemp = file.endsWith(".wav") ||
                       file.includes("_procesado") ||
                       file.includes("_vertical") ||
                       file.startsWith("drive_");

        if (isTemp && age > TEMP_MAX_AGE_MS) {
          results.freedMB += stat.size / (1024 * 1024);
          fs.unlinkSync(filePath);
          results.deleted.push(`${file} (orphan temp)`);
          continue;
        }

        results.skipped.push(`${file} (active or too recent)`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.errors.push(`${file}: ${msg}`);
      }
    }

    const freedMB = Math.round(results.freedMB * 10) / 10;
    return NextResponse.json({
      message: `Cleanup complete: ${results.deleted.length} deleted (${freedMB} MB freed), ${results.skipped.length} skipped`,
      results: { ...results, freedMB },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, results }, { status: 500 });
  }
}
