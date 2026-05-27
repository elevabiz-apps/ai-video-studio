"use client";

import { useState, useEffect, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface DashboardData {
  connections: {
    drive: { configured: boolean; authenticated: boolean };
    blotato: { configured: boolean };
    apify: { configured: boolean };
  };
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
}

interface AutoConfig {
  id: string;
  drive_folder_id: string | null;
  drive_folder_name: string | null;
  default_mode: string;
  caption_preset: string;
  platforms: string;
  content_profile_id: string | null;
  schedule_strategy: string;
  posts_per_day: number;
  spread_days: number;
  enabled: number;
}

interface SyncEntry {
  id: string;
  drive_file_id: string;
  drive_filename: string | null;
  project_id: string | null;
  status: string;
  error: string | null;
  created_at: string;
  updated_at: string;
}

interface ContentProfile {
  id: string;
  niche: string | null;
  sub_niches: string;
  optimal_duration_min: number;
  optimal_duration_max: number;
  pacing: string;
  avg_views: number | null;
  avg_engagement_rate: number | null;
  reference_profiles: string;
  top_hooks: string;
  created_at: string;
}

interface DriveFolder {
  id: string;
  name: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard");
      if (!res.ok) throw new Error("Failed to load dashboard");
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15_000); // refresh every 15s
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div style={{ padding: 40, color: "var(--muted-foreground)", textAlign: "center" }}>
        Cargando dashboard...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: 40, color: "var(--destructive)", textAlign: "center" }}>
        {error ?? "Error desconocido"}
      </div>
    );
  }

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>
            Automatización
          </h1>
          <p style={{ color: "var(--muted-foreground)", fontSize: 14 }}>
            Pipeline automático: Google Drive → Procesar → Aprobar → Publicar
          </p>
        </div>
        <a
          href="/dashboard/analytics"
          style={{
            background: "var(--accent)",
            color: "white",
            padding: "8px 16px",
            borderRadius: 8,
            textDecoration: "none",
            fontWeight: 600,
            fontSize: 13,
            whiteSpace: "nowrap",
          }}
        >
          📊 Analytics
        </a>
      </div>

      {/* Connection Status */}
      <ConnectionsSection connections={data.connections} onRefresh={fetchData} />

      {/* Stats */}
      <StatsSection stats={data.stats} />

      {/* Auto Config */}
      <AutoConfigSection
        configs={data.configs}
        profiles={data.profiles}
        driveConnected={data.connections.drive.authenticated}
        onRefresh={fetchData}
      />

      {/* Content Profiles */}
      <ProfilesSection
        profiles={data.profiles}
        apifyConfigured={data.connections.apify.configured}
        onRefresh={fetchData}
      />

      {/* Sync Log */}
      <SyncLogSection syncLog={data.syncLog} onRefresh={fetchData} />
    </div>
  );
}

// ─── Connections ─────────────────────────────────────────────────────────────

function ConnectionsSection({
  connections,
  onRefresh,
}: {
  connections: DashboardData["connections"];
  onRefresh: () => void;
}) {
  const connectDrive = async () => {
    const res = await fetch("/api/auth/google");
    const json = await res.json();
    if (json.url) {
      window.open(json.url, "_blank", "width=600,height=700");
    }
  };

  const disconnectDrive = async () => {
    await fetch("/api/auth/google", { method: "DELETE" });
    onRefresh();
  };

  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Conexiones</h2>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <ConnectionCard
          name="Google Drive"
          icon="📁"
          status={
            !connections.drive.configured
              ? "no-config"
              : connections.drive.authenticated
                ? "connected"
                : "disconnected"
          }
          onConnect={connectDrive}
          onDisconnect={disconnectDrive}
          configHint="GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET"
        />
        <ConnectionCard
          name="Blotato"
          icon="📤"
          status={connections.blotato.configured ? "connected" : "no-config"}
          configHint="BLOTATO_API_KEY"
        />
        <ConnectionCard
          name="Apify"
          icon="🔍"
          status={connections.apify.configured ? "connected" : "no-config"}
          configHint="APIFY_API_TOKEN"
        />
      </div>
    </div>
  );
}

function ConnectionCard({
  name,
  icon,
  status,
  onConnect,
  onDisconnect,
  configHint,
}: {
  name: string;
  icon: string;
  status: "connected" | "disconnected" | "no-config";
  onConnect?: () => void;
  onDisconnect?: () => void;
  configHint: string;
}) {
  const statusColors = {
    connected: { bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.3)", text: "#22c55e", label: "Conectado" },
    disconnected: { bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.3)", text: "#f59e0b", label: "Desconectado" },
    "no-config": { bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.3)", text: "#ef4444", label: "No configurado" },
  };
  const s = statusColors[status];

  return (
    <div
      style={{
        background: "var(--muted)",
        border: `1px solid var(--border)`,
        borderRadius: 12,
        padding: 16,
        minWidth: 200,
        flex: 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <span style={{ fontWeight: 700, fontSize: 14 }}>{name}</span>
      </div>
      <div
        style={{
          display: "inline-block",
          background: s.bg,
          border: `1px solid ${s.border}`,
          color: s.text,
          borderRadius: 20,
          padding: "2px 10px",
          fontSize: 11,
          fontWeight: 700,
          marginBottom: 8,
        }}
      >
        {s.label}
      </div>
      {status === "no-config" && (
        <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 4 }}>
          Configurar: {configHint}
        </div>
      )}
      {status === "disconnected" && onConnect && (
        <button onClick={onConnect} style={buttonStyle("#6366f1")}>
          Conectar
        </button>
      )}
      {status === "connected" && onDisconnect && (
        <button onClick={onDisconnect} style={buttonStyle("var(--muted-foreground)")}>
          Desconectar
        </button>
      )}
    </div>
  );
}

// ─── Stats ───────────────────────────────────────────────────────────────────

function StatsSection({ stats }: { stats: DashboardData["stats"] }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Estado</h2>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <StatCard label="En cola" value={stats.processing} color="#f59e0b" />
        <StatCard label="Pendientes de revisión" value={stats.pendingReview} color="#6366f1" />
        <StatCard label="Publicados" value={stats.published} color="#22c55e" />
        <StatCard label="Fallidos" value={stats.failed} color="#ef4444" />
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      style={{
        background: "var(--muted)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "16px 20px",
        minWidth: 150,
        flex: 1,
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 4 }}>{label}</div>
    </div>
  );
}

// ─── Auto Config ─────────────────────────────────────────────────────────────

function AutoConfigSection({
  configs,
  profiles,
  driveConnected,
  onRefresh,
}: {
  configs: AutoConfig[];
  profiles: ContentProfile[];
  driveConnected: boolean;
  onRefresh: () => void;
}) {
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [checking, setChecking] = useState(false);

  const loadFolders = async () => {
    if (!driveConnected) return;
    setLoadingFolders(true);
    try {
      const res = await fetch("/api/drive/folders");
      const json = await res.json();
      setFolders(json.folders ?? []);
    } catch { /* ignore */ }
    setLoadingFolders(false);
  };

  const createConfig = async (folderId: string, folderName: string) => {
    await fetch("/api/auto-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        drive_folder_id: folderId,
        drive_folder_name: folderName,
      }),
    });
    onRefresh();
  };

  const toggleConfig = async (config: AutoConfig) => {
    await fetch("/api/auto-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: config.id,
        enabled: !config.enabled,
      }),
    });
    onRefresh();
  };

  const checkNow = async () => {
    setChecking(true);
    try {
      await fetch("/api/cron/check-drive");
    } catch { /* ignore */ }
    setChecking(false);
    onRefresh();
  };

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>Carpetas de Drive</h2>
        <div style={{ display: "flex", gap: 8 }}>
          {driveConnected && (
            <button onClick={checkNow} disabled={checking} style={buttonStyle("#6366f1")}>
              {checking ? "Buscando..." : "Buscar ahora"}
            </button>
          )}
        </div>
      </div>

      {configs.length === 0 ? (
        <div
          style={{
            background: "var(--muted)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 24,
            textAlign: "center",
          }}
        >
          {driveConnected ? (
            <>
              <p style={{ color: "var(--muted-foreground)", fontSize: 13, marginBottom: 12 }}>
                No hay carpetas configuradas. Seleccioná una carpeta de Drive para monitorear.
              </p>
              <button onClick={loadFolders} disabled={loadingFolders} style={buttonStyle("#6366f1")}>
                {loadingFolders ? "Cargando..." : "Seleccionar carpeta"}
              </button>
              {folders.length > 0 && (
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                  {folders.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => createConfig(f.id, f.name)}
                      style={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        padding: "8px 12px",
                        fontSize: 13,
                        cursor: "pointer",
                        textAlign: "left",
                        color: "var(--foreground)",
                      }}
                    >
                      📁 {f.name}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p style={{ color: "var(--muted-foreground)", fontSize: 13 }}>
              Conectá Google Drive primero para configurar carpetas.
            </p>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {configs.map((config) => (
            <div
              key={config.id}
              style={{
                background: "var(--muted)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  📁 {config.drive_folder_name ?? "Carpeta sin nombre"}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>
                  Modo: {config.default_mode} · Preset: {config.caption_preset} · {config.posts_per_day} posts/día
                </div>
              </div>
              <button
                onClick={() => toggleConfig(config)}
                style={{
                  background: config.enabled ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                  color: config.enabled ? "#22c55e" : "#ef4444",
                  border: "none",
                  borderRadius: 20,
                  padding: "4px 14px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {config.enabled ? "Activo" : "Pausado"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Profiles ────────────────────────────────────────────────────────────────

function ProfilesSection({
  profiles,
  apifyConfigured,
  onRefresh,
}: {
  profiles: ContentProfile[];
  apifyConfigured: boolean;
  onRefresh: () => void;
}) {
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);

  const handleScrape = async () => {
    if (!scrapeUrl.trim()) return;
    setScraping(true);
    setScrapeError(null);

    try {
      const res = await fetch("/api/references/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: scrapeUrl.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setScrapeError(json.error ?? "Error scraping profile");
      } else {
        setScrapeUrl("");
        onRefresh();
      }
    } catch (err) {
      setScrapeError(err instanceof Error ? err.message : "Error");
    }

    setScraping(false);
  };

  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Perfiles de Referencia</h2>

      {/* Add reference */}
      {apifyConfigured && (
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 12,
          }}
        >
          <input
            type="text"
            value={scrapeUrl}
            onChange={(e) => setScrapeUrl(e.target.value)}
            placeholder="URL del perfil o @usuario (TikTok, IG, YouTube)"
            onKeyDown={(e) => e.key === "Enter" && handleScrape()}
            style={{
              flex: 1,
              background: "var(--muted)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 13,
              color: "var(--foreground)",
              outline: "none",
            }}
          />
          <button onClick={handleScrape} disabled={scraping} style={buttonStyle("#6366f1")}>
            {scraping ? "Analizando..." : "Analizar perfil"}
          </button>
        </div>
      )}
      {scrapeError && (
        <div style={{ color: "var(--destructive)", fontSize: 12, marginBottom: 8 }}>{scrapeError}</div>
      )}

      {profiles.length === 0 ? (
        <div
          style={{
            background: "var(--muted)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 24,
            textAlign: "center",
            color: "var(--muted-foreground)",
            fontSize: 13,
          }}
        >
          {apifyConfigured
            ? "No hay perfiles de referencia. Analizá un perfil para personalizar el scoring de clips."
            : "Configurá APIFY_API_TOKEN para analizar perfiles de referencia."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {profiles.map((profile) => {
            const refs = safeParseArray(profile.reference_profiles);
            const hooks = safeParseArray(profile.top_hooks);

            return (
              <div
                key={profile.id}
                style={{
                  background: "var(--muted)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: 16,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                      {profile.niche ? `Nicho: ${profile.niche}` : "Perfil sin categorizar"}
                    </div>
                    {refs.length > 0 && (
                      <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                        Referencias: {refs.join(", ")}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 12, flexShrink: 0 }}>
                    {profile.avg_views !== null && (
                      <MiniStat label="Views prom." value={formatNumber(profile.avg_views)} />
                    )}
                    {profile.avg_engagement_rate !== null && (
                      <MiniStat label="ER prom." value={`${profile.avg_engagement_rate}%`} />
                    )}
                    <MiniStat label="Duración" value={`${profile.optimal_duration_min}-${profile.optimal_duration_max}s`} />
                    <MiniStat label="Ritmo" value={profile.pacing} />
                  </div>
                </div>
                {hooks.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted-foreground)" }}>
                    Top hooks: {hooks.slice(0, 3).map((h) => `"${h.slice(0, 40)}..."`).join(" · ")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Sync Log ────────────────────────────────────────────────────────────────

function SyncLogSection({
  syncLog,
  onRefresh,
}: {
  syncLog: SyncEntry[];
  onRefresh: () => void;
}) {
  const approveEntry = async (entry: SyncEntry) => {
    await fetch("/api/drive-sync", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: entry.id, status: "approved" }),
    });
    onRefresh();
  };

  const rejectEntry = async (entry: SyncEntry) => {
    await fetch("/api/drive-sync", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: entry.id, status: "failed" }),
    });
    onRefresh();
  };

  if (syncLog.length === 0) {
    return (
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Historial</h2>
        <div
          style={{
            background: "var(--muted)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 24,
            textAlign: "center",
            color: "var(--muted-foreground)",
            fontSize: 13,
          }}
        >
          No hay videos procesados aún.
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Historial</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {syncLog.map((entry) => (
          <div
            key={entry.id}
            style={{
              background: "var(--muted)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "10px 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {entry.drive_filename ?? "Video sin nombre"}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                {new Date(entry.created_at).toLocaleString("es-AR")}
                {entry.project_id && (
                  <> · <a href={`/projects/${entry.project_id}`} style={{ color: "var(--accent)", textDecoration: "none" }}>Ver proyecto</a></>
                )}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <StatusBadge status={entry.status} />
              {entry.status === "pending_review" && (
                <>
                  <button onClick={() => approveEntry(entry)} style={buttonStyle("#22c55e", true)}>
                    Aprobar
                  </button>
                  <button onClick={() => rejectEntry(entry)} style={buttonStyle("#ef4444", true)}>
                    Descartar
                  </button>
                </>
              )}
            </div>
            {entry.error && (
              <div style={{ fontSize: 11, color: "var(--destructive)" }}>{entry.error}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Shared UI ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    detected: { bg: "rgba(99,102,241,0.15)", text: "#6366f1" },
    downloading: { bg: "rgba(245,158,11,0.15)", text: "#f59e0b" },
    processing: { bg: "rgba(245,158,11,0.15)", text: "#f59e0b" },
    pending_review: { bg: "rgba(139,92,246,0.15)", text: "#8b5cf6" },
    approved: { bg: "rgba(34,197,94,0.15)", text: "#22c55e" },
    publishing: { bg: "rgba(245,158,11,0.15)", text: "#f59e0b" },
    published: { bg: "rgba(34,197,94,0.15)", text: "#22c55e" },
    failed: { bg: "rgba(239,68,68,0.15)", text: "#ef4444" },
  };
  const c = colors[status] ?? colors.detected;

  const labels: Record<string, string> = {
    detected: "Detectado",
    downloading: "Descargando",
    processing: "Procesando",
    pending_review: "Revisar",
    approved: "Aprobado",
    publishing: "Publicando",
    published: "Publicado",
    failed: "Error",
  };

  return (
    <span
      style={{
        background: c.bg,
        color: c.text,
        borderRadius: 20,
        padding: "2px 10px",
        fontSize: 11,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {labels[status] ?? status}
    </span>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{label}</div>
    </div>
  );
}

function buttonStyle(color: string, small = false): React.CSSProperties {
  return {
    background: color,
    color: "#fff",
    border: "none",
    borderRadius: small ? 6 : 8,
    padding: small ? "4px 10px" : "8px 16px",
    fontSize: small ? 11 : 13,
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function safeParseArray(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
