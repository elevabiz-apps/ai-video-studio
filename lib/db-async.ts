/**
 * Async database abstraction layer.
 * Uses Supabase Postgres when SUPABASE_URL is set (production / Railway).
 * Falls back to synchronous SQLite wrapped in Promises for local dev.
 */

import type { Project, Clip, Render, Job } from "./db";
import { hasSupabase, getSupabaseClient } from "./supabase-client";

// ─── helpers ────────────────────────────────────────────────────────────────

// Cast to any so TypeScript doesn't complain about unknown table schemas.
// The Supabase client is untyped (no generated types file) — we manage types via our own interfaces.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function supabase(): any {
  return getSupabaseClient();
}

function sqlite() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("./db") as typeof import("./db");
}

async function supabaseQuery<T>(
  table: string,
  query: (sb: ReturnType<typeof getSupabaseClient>) => Promise<{ data: T | null; error: unknown }>
): Promise<T | null> {
  const { data, error } = await query(supabase());
  if (error) throw error;
  return data;
}

// ─── Projects ────────────────────────────────────────────────────────────────

export async function getAllProjects(): Promise<Project[]> {
  if (hasSupabase()) {
    const { data, error } = await supabase()
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as Project[];
  }
  return sqlite().projectQueries.getAll.all() as Project[];
}

export async function getProjectById(id: string): Promise<Project | null> {
  if (hasSupabase()) {
    const { data, error } = await supabase()
      .from("projects")
      .select("*")
      .eq("id", id)
      .single();
    if (error && (error as { code?: string }).code === "PGRST116") return null; // not found
    if (error) throw error;
    return data as Project | null;
  }
  return (sqlite().projectQueries.getById.get(id) as Project) ?? null;
}

export async function createProject(id: string, name: string, mode: string): Promise<void> {
  if (hasSupabase()) {
    const { error } = await supabase()
      .from("projects")
      .insert({ id, name, mode });
    if (error) throw error;
    return;
  }
  sqlite().projectQueries.create.run(id, name, mode);
}

export async function updateProjectField(
  id: string,
  fields: Partial<Omit<Project, "id" | "created_at">>
): Promise<void> {
  if (hasSupabase()) {
    const { error } = await supabase()
      .from("projects")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    return;
  }
  sqlite().projectQueries.updateField(id, fields);
}

export async function deleteProject(id: string): Promise<void> {
  if (hasSupabase()) {
    const { error } = await supabase()
      .from("projects")
      .delete()
      .eq("id", id);
    if (error) throw error;
    return;
  }
  sqlite().projectQueries.delete.run(id);
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export async function getJobById(id: string): Promise<Job | null> {
  if (hasSupabase()) {
    const { data, error } = await supabase()
      .from("jobs")
      .select("*")
      .eq("id", id)
      .single();
    if (error && (error as { code?: string }).code === "PGRST116") return null;
    if (error) throw error;
    return data as Job | null;
  }
  return (sqlite().jobQueries.getById.get(id) as Job) ?? null;
}

export async function getLatestJobByProject(projectId: string): Promise<Job | null> {
  if (hasSupabase()) {
    const { data, error } = await supabase()
      .from("jobs")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data as Job | null;
  }
  return (sqlite().jobQueries.getLatestByProject.get(projectId) as Job) ?? null;
}

export async function createJob(id: string, type: string, projectId: string): Promise<void> {
  if (hasSupabase()) {
    const { error } = await supabase()
      .from("jobs")
      .insert({ id, type, project_id: projectId });
    if (error) throw error;
    return;
  }
  sqlite().jobQueries.create.run(id, type, projectId);
}

export async function updateJobStatus(
  id: string,
  status: string,
  progress: number,
  currentStep: string | null,
  error: string | null
): Promise<void> {
  if (hasSupabase()) {
    const { error: err } = await supabase()
      .from("jobs")
      .update({ status, progress, current_step: currentStep, error, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (err) throw err;
    return;
  }
  sqlite().jobQueries.updateStatus.run(status, progress, currentStep, error, id);
}

export async function setJobResult(id: string, result: string): Promise<void> {
  if (hasSupabase()) {
    const { error } = await supabase()
      .from("jobs")
      .update({ result, status: "complete", progress: 100, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    return;
  }
  sqlite().jobQueries.setResult.run(result, id);
}

// ─── Renders ──────────────────────────────────────────────────────────────────

export async function getRenderById(id: string): Promise<Render | null> {
  if (hasSupabase()) {
    const { data, error } = await supabase()
      .from("renders")
      .select("*")
      .eq("id", id)
      .single();
    if (error && (error as { code?: string }).code === "PGRST116") return null;
    if (error) throw error;
    return data as Render | null;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const db = require("./db").default as import("better-sqlite3").Database;
  return (db.prepare("SELECT * FROM renders WHERE id = ?").get(id) as Render) ?? null;
}

export async function getRendersByProject(projectId: string): Promise<Render[]> {
  if (hasSupabase()) {
    const { data, error } = await supabase()
      .from("renders")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as Render[];
  }
  return sqlite().renderQueries.getByProject.all(projectId) as Render[];
}

export async function createRender(
  id: string,
  projectId: string,
  platform: string,
  clipId?: string | null
): Promise<void> {
  if (hasSupabase()) {
    const { error } = await supabase()
      .from("renders")
      .insert({ id, project_id: projectId, platform, clip_id: clipId ?? null });
    if (error) throw error;
    return;
  }
  if (clipId) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const db = require("./db").default as import("better-sqlite3").Database;
    db.prepare("INSERT INTO renders (id, project_id, clip_id, platform) VALUES (?, ?, ?, ?)").run(id, projectId, clipId, platform);
  } else {
    sqlite().renderQueries.create.run(id, projectId, platform);
  }
}

export async function updateRender(
  id: string,
  status: string,
  progress: number,
  outputPath: string | null
): Promise<void> {
  if (hasSupabase()) {
    const { error } = await supabase()
      .from("renders")
      .update({ status, progress, output_path: outputPath })
      .eq("id", id);
    if (error) throw error;
    return;
  }
  sqlite().renderQueries.update.run(status, progress, outputPath, id);
}

// ─── Clips ────────────────────────────────────────────────────────────────────

export async function getClipsByProject(projectId: string): Promise<Clip[]> {
  if (hasSupabase()) {
    const { data, error } = await supabase()
      .from("clips")
      .select("*")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Clip[];
  }
  return sqlite().clipQueries.getByProject.all(projectId) as Clip[];
}

export async function createClip(
  id: string,
  projectId: string,
  startSeconds: number,
  endSeconds: number
): Promise<void> {
  if (hasSupabase()) {
    const { error } = await supabase()
      .from("clips")
      .insert({ id, project_id: projectId, start_seconds: startSeconds, end_seconds: endSeconds });
    if (error) throw error;
    return;
  }
  sqlite().clipQueries.create.run(id, projectId, startSeconds, endSeconds);
}

export async function updateClipScore(
  id: string,
  score: number,
  reasoning: string
): Promise<void> {
  if (hasSupabase()) {
    const { error } = await supabase()
      .from("clips")
      .update({ ai_score: score, ai_reasoning: reasoning })
      .eq("id", id);
    if (error) throw error;
    return;
  }
  sqlite().clipQueries.updateScore.run(score, reasoning, id);
}

export async function updateClipName(id: string, name: string): Promise<void> {
  if (hasSupabase()) {
    const { error } = await supabase()
      .from("clips")
      .update({ name })
      .eq("id", id);
    if (error) throw error;
    return;
  }
  sqlite().clipQueries.updateName.run(name, id);
}

export async function updateClipSortOrder(id: string, sortOrder: number): Promise<void> {
  if (hasSupabase()) {
    const { error } = await supabase()
      .from("clips")
      .update({ sort_order: sortOrder })
      .eq("id", id);
    if (error) throw error;
    return;
  }
  sqlite().clipQueries.updateSortOrder.run(sortOrder, id);
}

export async function updateClipOutputPath(id: string, outputPath: string): Promise<void> {
  if (hasSupabase()) {
    const { error } = await supabase()
      .from("clips")
      .update({ output_path: outputPath })
      .eq("id", id);
    if (error) throw error;
    return;
  }
  sqlite().clipQueries.updateOutputPath.run(outputPath, id);
}

export async function updateClipHookPhrase(id: string, hookPhrase: string): Promise<void> {
  if (hasSupabase()) {
    const { error } = await supabase()
      .from("clips")
      .update({ hook_phrase: hookPhrase })
      .eq("id", id);
    if (error) throw error;
    return;
  }
  sqlite().clipQueries.updateHookPhrase.run(hookPhrase, id);
}

export async function deleteClipsByProject(projectId: string): Promise<void> {
  if (hasSupabase()) {
    const { error } = await supabase()
      .from("clips")
      .delete()
      .eq("project_id", projectId);
    if (error) throw error;
    return;
  }
  sqlite().clipQueries.deleteByProject.run(projectId);
}
