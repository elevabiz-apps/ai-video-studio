export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAllProjects, createProject, getProjectById } from "@/lib/db-async";
import { randomUUID } from "crypto";

export async function GET() {
  try {
    const projects = await getAllProjects();
    return NextResponse.json(projects);
  } catch (err) {
    // Surface the real DB error instead of a bare empty 500. The most common
    // cause is PGRST205 ("Could not find the table 'public.projects' in the
    // schema cache") when the Supabase schema is missing/drifted — actionable
    // fix is to run supabase-schema.sql (which reloads the PostgREST cache).
    // Supabase/PostgREST errors are plain objects ({message, code, details,
    // hint}), not Error instances, so handle both shapes.
    const message =
      err instanceof Error
        ? err.message
        : err && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message)
          : String(err);
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: unknown }).code)
        : undefined;
    console.error("[api/projects] GET failed:", code, message);
    const isMissingSchema =
      code === "PGRST205" || code === "PGRST205".toLowerCase() || message.includes("schema cache");
    return NextResponse.json(
      {
        error: "No se pudieron cargar los proyectos.",
        detail: message,
        code,
        fix: isMissingSchema
          ? "Correr supabase-schema.sql en Supabase → SQL Editor (crea las tablas + recarga el cache de PostgREST)."
          : undefined,
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, mode = "single" } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const id = randomUUID();
  await createProject(id, name.trim(), mode);

  const project = await getProjectById(id);
  return NextResponse.json(project, { status: 201 });
}
