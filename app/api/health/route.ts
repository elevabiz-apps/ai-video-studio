import { NextResponse } from "next/server";
import { checkDbHealth, REQUIRED_TABLES } from "@/lib/db-health";

export const dynamic = "force-dynamic";

// GET /api/health — estado de la base. 200 si todo OK, 503 si faltan tablas.
// Útil para monitoreo y para diagnosticar rápido el error PGRST205.
export async function GET() {
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
    { status: db.ok ? 200 : 503 },
  );
}
