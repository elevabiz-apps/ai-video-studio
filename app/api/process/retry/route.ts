export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getProjectById, updateProjectField, getLatestJobByProject, createJob } from "@/lib/db-async";
import { randomUUID } from "crypto";
import { spawnPipeline, spawnMultiClipPipeline } from "@/lib/processing";

/**
 * POST /api/process/retry
 * Body: { projectId: string }
 *
 * Retries a failed pipeline. Resets the project status and starts a new job.
 * The pipeline is smart enough to skip steps that already have results
 * (e.g., if captions already exist, transcription is skipped).
 */
export async function POST(req: NextRequest) {
  const { projectId } = await req.json();

  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  }

  const project = await getProjectById(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (!project.source_video) {
    return NextResponse.json({ error: "No video uploaded yet" }, { status: 400 });
  }

  // Guard: reject if a pipeline job is already running
  const existingJob = await getLatestJobByProject(projectId);
  if (existingJob && existingJob.status === "processing") {
    return NextResponse.json(
      { error: "Ya hay un pipeline corriendo para este proyecto", jobId: existingJob.id },
      { status: 409 }
    );
  }

  // Create a new job
  const jobId = randomUUID();
  await createJob(jobId, "pipeline-retry", projectId);

  // Reset project status to processing
  await updateProjectField(projectId, { status: "processing" });

  // Spawn pipeline in background (same pipeline, it will resume from available data)
  const pipeline = project.mode === "clips" ? spawnMultiClipPipeline : spawnPipeline;

  pipeline(jobId, projectId, project.source_video).catch((err) => {
    console.error("Pipeline retry error:", err);
  });

  return NextResponse.json({ jobId, retried: true });
}
