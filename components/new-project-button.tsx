"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewProjectButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"single" | "clips">("single");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function create() {
    if (!name.trim()) return;
    setLoading(true);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mode }),
    });
    const project = await res.json();
    setLoading(false);
    setOpen(false);
    setName("");
    router.push(`/projects/${project.id}`);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          background: "var(--accent)",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "10px 20px",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 16 }}>+</span> Nuevo proyecto
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              padding: 32,
              width: 400,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>Nuevo proyecto</h2>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, color: "var(--muted-foreground)", display: "block", marginBottom: 6 }}>
                Nombre
              </label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && create()}
                placeholder="Ej: Video sobre duelos"
                style={{
                  width: "100%",
                  background: "var(--muted)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "10px 14px",
                  fontSize: 14,
                  color: "var(--foreground)",
                  outline: "none",
                }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 13, color: "var(--muted-foreground)", display: "block", marginBottom: 6 }}>
                Modo
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                {(["single", "clips"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    style={{
                      flex: 1,
                      padding: "10px 14px",
                      borderRadius: 8,
                      border: `1px solid ${mode === m ? "var(--accent)" : "var(--border)"}`,
                      background: mode === m ? "rgba(99,102,241,0.15)" : "var(--muted)",
                      color: mode === m ? "var(--accent)" : "var(--muted-foreground)",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {m === "single" ? "🎬 Video único" : "✂️ Multi-clip"}
                  </button>
                ))}
              </div>
              <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 8 }}>
                {mode === "single"
                  ? "Editar un video completo con subtítulos y corte de silencios"
                  : "Extraer múltiples clips de un video largo y puntuarlos con IA"}
              </p>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setOpen(false)}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--muted-foreground)",
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={create}
                disabled={!name.trim() || loading}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: 8,
                  border: "none",
                  background: name.trim() ? "var(--accent)" : "var(--muted)",
                  color: name.trim() ? "#fff" : "var(--muted-foreground)",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: name.trim() ? "pointer" : "not-allowed",
                }}
              >
                {loading ? "Creando..." : "Crear"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
