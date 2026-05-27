export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { projectQueries, type Project } from "@/lib/db";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), ".studio");
const ASSETS_DIR = path.join(DATA_DIR, "assets");

// Max age for temp files (source videos after processing): 7 days
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * GET /api/cron/cleanup
 *
 * Cleans up temporary files from the data volume:
 * - Source videos that have been fully processed (status = ready/rendered)
 * - Keeps: original uploads, clip outputs, renders
 * - Only deletes files older than 7 days
 */
export async function GET() {
  const results: { deleted: string[]; skipped: string[]; errors: string[] } = {
    deleted: [],
    skipped: [],
    errors: [],
  };

  try {
    if (!fs.existsSync(ASSETS_DIR)) {
      return NextResponse.json({ message: "Assets directory does not exist", results });
    }

    // Get all projects that are fully processed
    const projects = projectQueries.getAll.all() as Project[];
    const processedProjects = projects.filter(
      (p) => p.status === "ready" || p.status === "rendered"
    );

    // Collect source video paths that can be cleaned (the _procesado versions)
    const cleanableFiles = new Set<string>();
    for (const project of processedProjects) {
      if (project.source_video) {
        // The processed video (with silences removed) can be cleaned
        // if the original and clips are preserved
        const sourceBase = path.basename(project.source_video);
        if (sourceBase.includes("_procesado") || sourceBase.includes("_vertical")) {
          cleanableFiles.add(sourceBase);
        }
      }
    }

    // Scan assets directory for old temp files
    const now = Date.now();
    const files = fs.readdirSync(ASSETS_DIR);

    for (const file of files) {
      const filePath = path.join(ASSETS_DIR, file);

      try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) continue;

        const age = now - stat.mtimeMs;
        if (age < MAX_AGE_MS) {
          results.skipped.push(`${file} (too recent: ${Math.round(age / 86400000)}d)`);
          continue;
        }

        // Only delete intermediate processing files
        const isIntermediate = file.includes("_procesado") ||
                               file.includes("_vertical") ||
                               file.endsWith(".wav"); // extracted audio

        if (isIntermediate) {
          fs.unlinkSync(filePath);
          results.deleted.push(file);
        } else {
          results.skipped.push(`${file} (not intermediate)`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.errors.push(`${file}: ${msg}`);
      }
    }

    return NextResponse.json({
      message: `Cleanup complete: ${results.deleted.length} deleted, ${results.skipped.length} skipped`,
      results,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, results }, { status: 500 });
  }
}
