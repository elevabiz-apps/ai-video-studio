export const dynamic = "force-dynamic";

import { getAllProjects } from "@/lib/db-async";
import type { Project } from "@/lib/db";
import NewProjectButton from "@/components/new-project-button";
import ProjectCard from "@/components/project-card";

export default async function DashboardPage() {
  // Resiliencia: un error de la DB NO debe tirar toda la app (pantalla blanca).
  // Si falla, mostramos el error real en vez del digest críptico.
  let projects: Project[] = [];
  let loadError: string | null = null;
  try {
    projects = (await getAllProjects()) as Project[];
  } catch (e) {
    // El error de Supabase es un objeto plano ({code,message,details,hint}),
    // no un Error → extraer .message o serializar (no "[object Object]").
    const err = e as { message?: string };
    loadError = err?.message ?? (() => { try { return JSON.stringify(e); } catch { return String(e); } })();
    console.error("[homepage] No se pudieron cargar los proyectos:", e);
  }

  return (
    <div style={{ padding: 40 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 32,
        }}
      >
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>Proyectos</h1>
          <p style={{ color: "var(--muted-foreground)", fontSize: 14 }}>
            {loadError ? "—" : `${projects.length} proyecto${projects.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <NewProjectButton />
      </div>

      {loadError ? (
        <ErrorState message={loadError} />
      ) : projects.length === 0 ? (
        <EmptyState />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 16,
          }}
        >
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "80px 40px",
        color: "var(--muted-foreground)",
      }}
    >
      <div style={{ fontSize: 64, marginBottom: 16 }}>🎬</div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--foreground)", marginBottom: 8 }}>
        Sin proyectos todavía
      </h2>
      <p style={{ fontSize: 14, marginBottom: 24 }}>
        Crea tu primer proyecto para empezar a editar videos con IA.
      </p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "64px 40px",
        border: "1px solid rgba(224,85,85,0.3)",
        background: "rgba(224,85,85,0.06)",
        borderRadius: 16,
      }}
    >
      <div style={{ fontSize: 56, marginBottom: 16 }}>⚠️</div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--foreground)", marginBottom: 8 }}>
        No pudimos cargar los proyectos
      </h2>
      <p style={{ fontSize: 14, color: "var(--muted-foreground)", marginBottom: 8 }}>
        Hubo un problema al consultar la base de datos. Reintentá en unos segundos.
      </p>
      <p style={{ fontSize: 12, color: "var(--muted-foreground)", fontFamily: "monospace", opacity: 0.8 }}>
        {message}
      </p>
    </div>
  );
}
