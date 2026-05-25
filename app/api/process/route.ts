export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { projectQueries, jobQueries } from "@/lib/db";
import { randomUUID } from "crypto";
import { spawnPipeline, spawnMultiClipPipeline } from "@/lib/processing";

export async function POST(req: NextRequest) {
  const { projectId } = await req.json();

  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  }

  const project = projectQueries.getById.get(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (!project.source_video) {
    return NextResponse.json({ error: "No video uploaded yet" }, { status: 400 });
  }

  // Guard: reject if a pipeline job is already running for this project
  const existingJob = jobQueries.getLatestByProject.get(projectId);
  if (existingJob && existingJob.status === "processing") {
    return NextResponse.json(
      { error: "Ya hay un pipeline corriendo para este proyecto", jobId: existingJob.id },
      { status: 409 }
    );
  }

  // Create a job
  const jobId = randomUUID();
  jobQueries.create.run(jobId, "pipeline", projectId);

  // Update project status
  projectQueries.updateField(projectId, { status: "processing" });

  // Spawn pipeline in background (non-blocking) — choose based on project mode
  const pipeline =
    project.mode === "clips" ? spawnMultiClipPipeline : spawnPipeline;

  pipeline(jobId, projectId, project.source_video).catch((err) => {
    console.error("Pipeline error:", err);
  });

  return NextResponse.json({ jobId });
}
