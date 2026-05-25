"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Project } from "@/lib/db";

export default function ProjectCard({ project }: { project: Project }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const statusColors: Record<string, string> = {
    draft: "var(--muted-foreground)",
    processing: "var(--warning)",
    ready: "var(--success)",
    rendering: "var(--accent)",
    rendered: "var(--success)",
  };

  const statusLabels: Record<string, string> = {
    draft: "Borrador",
    processing: "Procesando",
    ready: "Listo",
    rendering: "Renderizando",
    rendered: "Renderizado",
  };

  const date = new Date(project.created_at + "Z").toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm) {
      setConfirm(true);
      setTimeout(() => setConfirm(false), 3000);
      return;
    }

    setDeleting(true);
    try {
      await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      router.refresh();
    } catch {
      setDeleting(false);
    }
  }

  return (
    <div style={{ position: "relative" }}>
      {/* Delete button */}
      <button
        onClick={handleDelete}
        disabled={deleting}
        title={confirm ? "Hacer click de nuevo para confirmar" : "Eliminar proyecto"}
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          zIndex: 10,
          background: confirm ? "var(--destructive, #e53e3e)" : "var(--muted)",
          border: confirm ? "1px solid var(--destructive, #e53e3e)" : "1px solid var(--border)",
          borderRadius: 8,
          width: 30,
          height: 30,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: deleting ? "not-allowed" : "pointer",
          fontSize: 14,
          transition: "background 0.2s, border-color 0.2s",
          opacity: deleting ? 0.5 : 1,
          color: confirm ? "#fff" : "var(--muted-foreground)",
        }}
      >
        {deleting ? "…" : confirm ? "✓" : "🗑"}
      </button>

      <Link href={`/projects/${project.id}`} style={{ textDecoration: "none" }}>
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 20,
            cursor: "pointer",
            transition: "border-color 0.15s, transform 0.1s",
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLDivElement;
            el.style.borderColor = "var(--accent)";
            el.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLDivElement;
            el.style.borderColor = "var(--border)";
            el.style.transform = "translateY(0)";
          }}
        >
          <div
            style={{
              height: 120,
              background: "var(--muted)",
              borderRadius: 8,
              marginBottom: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 36,
            }}
          >
            {project.source_video ? "🎬" : "📁"}
          </div>

          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{project.name}</div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: statusColors[project.status] || "var(--muted-foreground)",
                background: "var(--muted)",
                padding: "3px 8px",
                borderRadius: 20,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: statusColors[project.status] || "var(--muted-foreground)",
                  display: "inline-block",
                }}
              />
              {statusLabels[project.status] || project.status}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{date}</div>
          </div>
        </div>
      </Link>
    </div>
  );
}
