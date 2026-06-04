// Health-check de la base de datos.
// Verifica que las tablas que el AI Studio necesita existan en Supabase y, si
// faltan, loguea un mensaje claro y accionable en vez del críptico PGRST205
// ("Could not find the table 'public.projects' in the schema cache").
//
// Las 4 tablas (projects, clips, renders, jobs) NO se crean automáticamente:
// se crean a mano corriendo `supabase-schema.sql` en el SQL Editor de Supabase.
import { hasSupabase, getSupabaseClient } from "./supabase-client";

export const REQUIRED_TABLES = ["projects", "clips", "renders", "jobs"] as const;

export interface DbHealth {
  mode: "supabase" | "sqlite";
  ok: boolean;
  present: string[];
  missing: string[];
}

/** Proba cada tabla requerida con un head-select. Detecta faltantes (PGRST205 / 42P01). */
export async function checkDbHealth(): Promise<DbHealth> {
  if (!hasSupabase()) {
    // Sin Supabase → modo SQLite local; las tablas se crean solas en el arranque.
    return { mode: "sqlite", ok: true, present: [], missing: [] };
  }

  const sb = getSupabaseClient();
  const present: string[] = [];
  const missing: string[] = [];

  for (const table of REQUIRED_TABLES) {
    // head: true → request liviano (sin filas), solo valida que la tabla exista.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (sb as any).from(table).select("id", { head: true, count: "exact" });
    if (!error) {
      present.push(table);
      continue;
    }
    const code = (error as { code?: string }).code;
    if (code === "PGRST205" || code === "42P01") {
      missing.push(table); // tabla inexistente
    } else {
      // Error ajeno a "tabla faltante" (red, permisos): se reporta pero no se marca missing.
      console.warn(`[db-health] No se pudo verificar la tabla "${table}":`, (error as { message?: string }).message);
    }
  }

  return { mode: "supabase", ok: missing.length === 0, present, missing };
}

/** Corre el check y loguea el estado de forma clara. Usado en el arranque (instrumentation). */
export async function logDbHealth(): Promise<DbHealth> {
  const h = await checkDbHealth();

  if (h.mode === "sqlite") {
    console.log("[db-health] Modo SQLite local (sin SUPABASE_URL/SERVICE_ROLE_KEY) — OK.");
    return h;
  }

  if (h.ok) {
    console.log(`[db-health] Supabase OK — tablas presentes: ${REQUIRED_TABLES.join(", ")}.`);
  } else {
    console.error(
      `[db-health] ⚠️  FALTAN TABLAS en Supabase: ${h.missing.join(", ")}.\n` +
        `[db-health]    El AI Studio va a fallar con "PGRST205 Could not find the table 'public.<tabla>'".\n` +
        `[db-health]    FIX: correr el SQL de "supabase-schema.sql" en Supabase → SQL Editor (crea projects/clips/renders/jobs).`,
    );
  }
  return h;
}
