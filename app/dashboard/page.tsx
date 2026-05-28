"use client";

import { useEffect, useState } from "react";

type ConnectionStatus = {
  drive: { configured: boolean; authenticated: boolean };
  blotato: { configured: boolean };
  apify: { configured: boolean };
};

type AutoConfig = {
  id: string;
  drive_folder_id: string;
  drive_folder_name: string;
  default_mode: string;
  caption_preset: string;
  platforms: string;
  enabled: number;
  created_at: string;
};

type SyncEntry = {
  id: string;
  drive_file_id: string;
  drive_filename: string;
  project_id: string | null;
  status: string;
  error: string | null;
  created_at: string;
  updated_at: string;
};

type ContentProfile = {
  id: string;
  niche: string | null;
  sub_niches: string;
  optimal_duration_min: number;
  optimal_duration_max: number;
  pacing: string;
  caption_preset: string;
  avg_views: number | null;
  avg_engagement_rate: number | null;
  created_at: string;
};

type DashboardData = {
  connections: ConnectionStatus;
  configs: AutoConfig[];
  syncLog: SyncEntry[];
  profiles: ContentProfile[];
  stats: {
    pendingReview: number;
    processing: number;
    published: number;
    failed: number;
    totalProcessed: number;
  };
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 40, color: "var(--muted-foreground)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 16, height: 16, border: "2px solid var(--accent)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          Cargando dashboard...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: 40 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 16 }}>Automatización</h1>
        <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: 16, color: "#ef4444" }}>
          Error cargando dashboard: {error || "Sin datos"}
        </div>
      </div>
    );
  }

  const { connections, configs, syncLog, profiles, stats } = data;

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 6 }}>Automatización</h1>
        <p style={{ color: "var(--muted-foreground)", fontSize: 14 }}>
          Pipeline automático: Google Drive → Procesar → Aprobar → Publicar
        </p>
      </div>

      {/* Connection Status */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 28 }}>
        <ConnectionCard
          name="Google Drive"
          icon="📁"
          configured={connections.drive.configured}
          authenticated={connections.drive.authenticated}
          detail={connections.drive.authenticated ? "Conectado" : connections.drive.configured ? "Configurado (sin auth)" : "No configurado"}
        />
        <ConnectionCard
          name="Blotato"
          icon="📤"
          configured={connections.blotato.configured}
          authenticated={connections.blotato.configured}
          detail={connections.blotato.configured ? "API key activa" : "Sin API key"}
        />
        <ConnectionCard
          name="Apify"
          icon="🔍"
          configured={connections.apify.configured}
          authenticated={connections.apify.configured}
          detail={connections.apify.configured ? "Token activo" : "Sin token"}
        />
      </div>

      {/* Stats Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 28 }}>
        <StatCard label="Total procesados" value={stats.totalProcessed} color="var(--foreground)" />
        <StatCard label="Pendientes" value={stats.pendingReview} color="#f59e0b" />
        <StatCard label="Procesando" value={stats.processing} color="#6366f1" />
        <StatCard label="Publicados" value={stats.published} color="#22c55e" />
        <StatCard label="Fallidos" value={stats.failed} color="#ef4444" />
      </div>

      {/* Two columns: Configs + Profiles */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>
        {/* Auto-configs */}
        <SectionCard title="Configuraciones de Auto-Proceso" count={configs.length}>
          {configs.length === 0 ? (
            <EmptyState text="Sin configuraciones. Conectá Google Drive para empezar." />
          ) : (
            configs.map((c) => (
              <div key={c.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>📁 {c.drive_folder_name || "Carpeta sin nombre"}</div>
                    <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>
                      Modo: {c.default_mode} · Preset: {c.caption_preset} · Plataformas: {parsePlatforms(c.platforms)}
                    </div>
                  </div>
                  <StatusBadge active={!!c.enabled} />
                </div>
              </div>
            ))
          )}
        </SectionCard>

        {/* Content Profiles */}
        <SectionCard title="Perfiles de Contenido" count={profiles.length}>
          {profiles.length === 0 ? (
            <EmptyState text="Sin perfiles. Creá uno en Configuración para mejorar el scoring." />
          ) : (
            profiles.map((p) => (
              <div key={p.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {getNicheEmoji(p.niche)} {p.niche || "Sin nicho"}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>
                      Duración: {p.optimal_duration_min}–{p.optimal_duration_max}s · Ritmo: {p.pacing} · Preset: {p.caption_preset}
                    </div>
                  </div>
                  {p.avg_engagement_rate !== null && (
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#22c55e" }}>
                      {p.avg_engagement_rate.toFixed(1)}% ER
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </SectionCard>
      </div>

      {/* Sync Log */}
      <SectionCard title="Últimos Videos Sincronizados" count={syncLog.length}>
        {syncLog.length === 0 ? (
          <EmptyState text="No hay videos sincronizados todavía." />
        ) : (
          <div style={{ maxHeight: 400, overflowY: "auto" }}>
            {syncLog.slice(0, 25).map((entry) => (
              <div
                key={entry.id}
                style={{
                  padding: "10px 0",
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    🎬 {entry.drive_filename || "Sin nombre"}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>
                    {formatDate(entry.created_at)}
                    {entry.project_id && (
                      <> · <a href={`/projects/${entry.project_id}`} style={{ color: "var(--accent)", textDecoration: "none" }}>Ver proyecto</a></>
                    )}
                  </div>
                </div>
                <SyncStatusBadge status={entry.status} />
                {entry.error && (
                  <div style={{ fontSize: 11, color: "#ef4444", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={entry.error}>
                    {entry.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Quick links */}
      <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
        <QuickLink href="/dashboard/analytics" label="📊 Ver Analytics" />
        <QuickLink href="/dashboard/instagram" label="📱 Instagram Analytics" />
        <QuickLink href="/settings" label="⚙️ Configuración" />
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function ConnectionCard({ name, icon, configured, authenticated, detail }: {
  name: string; icon: string; configured: boolean; authenticated: boolean; detail: string;
}) {
  const color = authenticated ? "#22c55e" : configured ? "#f59e0b" : "var(--muted-foreground)";
  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 18px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <span style={{ fontWeight: 700, fontSize: 14 }}>{name}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
        <span style={{ fontSize: 12, color }}>{detail}</span>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10,
      padding: "14px 16px", textAlign: "center",
    }}>
      <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 6 }}>{label}</div>
    </div>
  );
}

function SectionCard({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "18px 20px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700 }}>{title}</h2>
        <span style={{ fontSize: 11, color: "var(--muted-foreground)", background: "var(--muted)", padding: "2px 8px", borderRadius: 12 }}>{count}</span>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ padding: "20px 0", textAlign: "center", color: "var(--muted-foreground)", fontSize: 13, fontStyle: "italic" }}>
      {text}
    </div>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 12,
      background: active ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
      color: active ? "#22c55e" : "#ef4444",
      border: `1px solid ${active ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
    }}>
      {active ? "Activo" : "Inactivo"}
    </span>
  );
}

function SyncStatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; color: string; label: string }> = {
    detected: { bg: "rgba(99,102,241,0.12)", color: "#6366f1", label: "Detectado" },
    downloading: { bg: "rgba(99,102,241,0.12)", color: "#6366f1", label: "Descargando" },
    processing: { bg: "rgba(245,158,11,0.12)", color: "#f59e0b", label: "Procesando" },
    pending_review: { bg: "rgba(245,158,11,0.12)", color: "#f59e0b", label: "Pendiente" },
    published: { bg: "rgba(34,197,94,0.12)", color: "#22c55e", label: "Publicado" },
    failed: { bg: "rgba(239,68,68,0.12)", color: "#ef4444", label: "Error" },
  };
  const s = styles[status] ?? { bg: "var(--muted)", color: "var(--muted-foreground)", label: status };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 12,
      background: s.bg, color: s.color, border: `1px solid ${s.color}33`, whiteSpace: "nowrap",
    }}>
      {s.label}
    </span>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} style={{
      display: "inline-block", padding: "8px 16px", background: "var(--accent)",
      color: "white", textDecoration: "none", borderRadius: 8, fontWeight: 600, fontSize: 14,
    }}>
      {label}
    </a>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function parsePlatforms(raw: string): string {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.length > 0 ? arr.join(", ") : "ninguna";
  } catch {
    return "ninguna";
  }
}

function getNicheEmoji(niche: string | null): string {
  const map: Record<string, string> = {
    fitness: "💪", educacion: "📚", humor: "😂", negocios: "💼",
    cocina: "🍳", tech: "💻", belleza: "💄", viajes: "✈️",
    lifestyle: "🌟", gaming: "🎮",
  };
  return niche ? map[niche] ?? "📋" : "📋";
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}
