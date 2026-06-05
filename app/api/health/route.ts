import { NextResponse } from "next/server";
import { checkDbHealth, REQUIRED_TABLES } from "@/lib/db-health";

export const dynamic = "force-dynamic";

// GET /api/health — LIVENESS para el healthcheck de Railway.
// SIEMPRE devuelve 200 si el proceso Node está vivo. El estado de la DB va en
// el body (`ok`, `missingTables`) para diagnóstico/monitoreo, pero NUNCA tira
// 5xx: si la DB tiene un problema, el contenedor debe seguir arriba (la app
// muestra un error amigable), no caerse entero. Un 5xx acá haría que el
// healthcheck de Railway tumbe el servicio en cada deploy.
export async function GET() {
  try {
    const db = await checkDbHealth();
    return NextResponse.json(
      {
        ok: db.ok,
        mode: db.mode,
        requiredTables: REQUIRED_TABLES,
        presentTables: db.present,
        missingTables: db.missing,
        ...(db.missing.length > 0 && {
          fix: "Correr supabase-schema.sql en Supabase → SQL Editor para crear las tablas faltantes.",
        }),
      },
      { status: 200 },
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, alive: true, error: e instanceof Error ? e.message : String(e) },
      { status: 200 },
    );
  }
}
