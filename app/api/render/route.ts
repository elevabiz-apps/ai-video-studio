export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { projectQueries, renderQueries, clipQueries } from "@/lib/db";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const { projectId, clipId, platform, captionPreset } = await req.json();

    if (!projectId || !platform) {
      return NextResponse.json({ error: "Missing projectId or platform" }, { status: 400 });
    }

    const project = projectQueries.getById.get(projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Resolve clip if provided (multi-clip mode)
    const clip = clipId ? clipQueries.getByProject.all(projectId).find((c) => c.id === clipId) : null;

    // Clean up old completed/failed renders for same project+platform to save disk
    const oldRenders = (renderQueries.getByProject.all(projectId) as import("@/lib/db").Render[])
      .filter((r) => r.platform === platform && (r.status === "complete" || r.status === "failed"));
    for (const old of oldRenders) {
      if (old.output_path) {
        const absPath = path.join(process.cwd(), "public", old.output_path);
        try { fs.unlinkSync(absPath); } catch { /* file may not exist */ }
      }
    }

    const renderId = randomUUID();
    // Insert render with optional clip_id
    if (clip) {
      (renderQueries as unknown as { createWithClip: import("better-sqlite3").Statement }).createWithClip?.run(renderId, projectId, clip.id, platform)
        ?? renderQueries.create.run(renderId, projectId, platform);
    } else {
      renderQueries.create.run(renderId, projectId, platform);
    }

    // Import and kick off render in background (non-blocking)
    import("@/lib/rendering").then(({ spawnRender }) => {
      spawnRender(renderId, project, platform, captionPreset ?? "bold", clip ?? undefined).catch((err: Error) => {
        console.error("Render error:", err.message);
      });
    });

    return NextResponse.json({
      id: renderId,
      project_id: projectId,
      clip_id: clipId ?? null,
      platform,
      status: "queued",
      progress: 0,
      output_path: null,
      error: null,
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Render API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
