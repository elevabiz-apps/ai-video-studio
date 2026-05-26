export const dynamic = "force-dynamic";

import { projectQueries } from "@/lib/db";
import type { Project } from "@/lib/db";
import NewProjectButton from "@/components/new-project-button";
import ProjectCard from "@/components/project-card";

export default function DashboardPage() {
  const projects = projectQueries.getAll.all() as Project[];

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
            {projects.length} proyecto{projects.length !== 1 ? "s" : ""}
          </p>
        </div>
        <NewProjectButton />
      </div>

      {projects.length === 0 ? (
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
