"use client";

import { useEffect, useState } from "react";

type ConnectionStatus = {
  drive: { configured: boolean; authenticated: boolean };
  blotato: { configured: boolean };
  apify: { configured: boolean };
};

type ContentProfile = {
  id: string;
  niche: string | null;
  sub_niches: string;
  optimal_duration_min: number;
  optimal_duration_max: number;
  pacing: string;
  caption_preset: string;
  words_per_phrase: number;
  silence_threshold_db: string;
  silence_min_duration: number;
  top_hooks: string;
  top_hashtags: string;
  best_posting_times: string;
  avg_views: number | null;
  avg_engagement_rate: number | null;
  reference_profiles: string;
  created_at: string;
};

type AutoConfig = {
  id: string;
  drive_folder_id: string;
  drive_folder_name: string;
  default_mode: string;
  caption_preset: string;
  platforms: string;
  posts_per_day: number;
  spread_days: number;
  schedule_strategy: string;
  enabled: number;
};

export default function SettingsPage() {
  const [connections, setConnections] = useState<ConnectionStatus | null>(null);
  const [profiles, setProfiles] = useState<ContentProfile[]>([]);
  const [configs, setConfigs] = useState<AutoConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"connections" | "profiles" | "auto-config">("connections");
  const [deletingProfile, setDeletingProfile] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => {
        setConnections(d.connections);
        setProfiles(d.profiles || []);
        setConfigs(d.configs || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleDeleteProfile = async (profileId: string) => {
    setDeletingProfile(profileId);
    try {
      const res = await fetch(`/api/references?profileId=${profileId}`, { method: "DELETE" });
      if (res.ok) {
        setProfiles((prev) => prev.filter((p) => p.id !== profileId));
      }
    } catch {
      // ignore
    }
    setDeletingProfile(null);
  };

  if (loading) {
    return (
      <div style={{ padding: 40, color: "var(--muted-foreground)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 16, height: 16, border: "2px solid var(--accent)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          Cargando configuración...
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "32px 40px", maxWidth: 900 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 6 }}>Configuración</h1>
      <p style={{ color: "var(--muted-foreground)", fontSize: 14, marginBottom: 28 }}>
        Conexiones, perfiles de contenido y configuración del pipeline
      </p>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "1px solid var(--border)", paddingBottom: 0 }}>
        {(["connections", "profiles", "auto-config"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              background: "transparent",
              border: "none",
              borderBottom: activeTab === tab ? "2px solid var(--accent)" : "2px solid transparent",
              color: activeTab === tab ? "var(--foreground)" : "var(--muted-foreground)",
              cursor: "pointer",
              marginBottom: -1,
            }}
          >
            {tab === "connections" ? "🔌 Conexiones" : tab === "profiles" ? "👤 Perfiles" : "⚙️ Auto-Config"}
          </button>
        ))}
      </div>

      {/* Connections Tab */}
      {activeTab === "connections" && connections && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <ConnectionRow
            name="Google Drive"
            icon="📁"
            description="Sube videos desde tu Drive para procesarlos automáticamente"
            status={connections.drive.authenticated ? "connected" : connections.drive.configured ? "configured" : "disconnected"}
            statusText={connections.drive.authenticated ? "Conectado y autenticado" : connections.drive.configured ? "Configurado, falta autenticar" : "No configurado"}
            envVars={["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]}
            actionUrl={connections.drive.configured && !connections.drive.authenticated ? "/api/auth/google" : undefined}
            actionLabel="Autenticar"
          />
          <ConnectionRow
            name="Blotato"
            icon="📤"
            description="Publica en TikTok, Instagram, YouTube, Twitter, LinkedIn, Facebook, Pinterest"
            status={connections.blotato.configured ? "connected" : "disconnected"}
            statusText={connections.blotato.configured ? "API key configurada" : "Sin API key"}
            envVars={["BLOTATO_API_KEY"]}
          />
          <ConnectionRow
            name="Anthropic (Claude)"
            icon="🧠"
            description="Scoring inteligente de clips con IA para identificar momentos virales"
            status="unknown"
            statusText="Verificar ANTHROPIC_API_KEY en variables de entorno"
            envVars={["ANTHROPIC_API_KEY"]}
          />
          <ConnectionRow
            name="Groq (Whisper)"
            icon="🎙️"
            description="Transcripción de audio a texto con timestamps palabra por palabra"
            status="unknown"
            statusText="Verificar GROQ_API_KEY en variables de entorno"
            envVars={["GROQ_API_KEY"]}
          />
          <ConnectionRow
            name="Apify"
            icon="🔍"
            description="Scraping de perfiles de referencia (TikTok, Instagram, YouTube)"
            status={connections.apify.configured ? "connected" : "disconnected"}
            statusText={connections.apify.configured ? "Token configurado" : "Sin token (opcional)"}
            envVars={["APIFY_API_TOKEN"]}
          />
        </div>
      )}

      {/* Profiles Tab */}
      {activeTab === "profiles" && (
        <div>
          <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 20, lineHeight: 1.6 }}>
            Los perfiles de contenido ayudan al sistema a identificar clips que encajen con tu nicho y estilo.
            Se construyen analizando posts exitosos de cuentas de referencia.
          </p>

          {profiles.length === 0 ? (
            <div style={{
              background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10,
              padding: 32, textAlign: "center",
            }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>👤</div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Sin perfiles de contenido</div>
              <div style={{ color: "var(--muted-foreground)", fontSize: 13, maxWidth: 400, margin: "0 auto" }}>
                Conectá Apify y usá la API <code style={{ background: "var(--muted)", padding: "1px 4px", borderRadius: 4 }}>/api/references/scrape</code> para
                analizar perfiles de referencia, o subí datos manualmente via CSV.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {profiles.map((p) => (
                <ProfileCard key={p.id} profile={p} onDelete={handleDeleteProfile} deleting={deletingProfile === p.id} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Auto-Config Tab */}
      {activeTab === "auto-config" && (
        <div>
          <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 20, lineHeight: 1.6 }}>
            Configuraciones de procesamiento automático para carpetas de Google Drive.
            Los videos nuevos se detectan cada 5 minutos y se procesan según estos ajustes.
          </p>

          {configs.length === 0 ? (
            <div style={{
              background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10,
              padding: 32, textAlign: "center",
            }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>⚙️</div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Sin configuraciones</div>
              <div style={{ color: "var(--muted-foreground)", fontSize: 13, maxWidth: 400, margin: "0 auto" }}>
                Conectá Google Drive y creá una configuración vía <code style={{ background: "var(--muted)", padding: "1px 4px", borderRadius: 4 }}>POST /api/auto-config</code> para automatizar el procesamiento.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {configs.map((c) => (
                <AutoConfigCard key={c.id} config={c} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ConnectionRow({ name, icon, description, status, statusText, envVars, actionUrl, actionLabel }: {
  name: string; icon: string; description: string;
  status: "connected" | "configured" | "disconnected" | "unknown";
  statusText: string; envVars: string[];
  actionUrl?: string; actionLabel?: string;
}) {
  const colorMap = { connected: "#22c55e", configured: "#f59e0b", disconnected: "#ef4444", unknown: "var(--muted-foreground)" };
  const color = colorMap[status];
  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10,
      padding: "16px 20px", display: "flex", alignItems: "center", gap: 16,
    }}>
      <span style={{ fontSize: 28 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{name}</div>
        <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 4 }}>{description}</div>
        <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
          Env: {envVars.map((v) => <code key={v} style={{ background: "var(--muted)", padding: "1px 4px", borderRadius: 4, marginRight: 4 }}>{v}</code>)}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
          <span style={{ fontSize: 12, color, whiteSpace: "nowrap" }}>{statusText}</span>
        </div>
        {actionUrl && (
          <a href={actionUrl} style={{
            padding: "5px 12px", background: "var(--accent)", color: "white",
            textDecoration: "none", borderRadius: 6, fontSize: 12, fontWeight: 600,
          }}>
            {actionLabel}
          </a>
        )}
      </div>
    </div>
  );
}

function ProfileCard({ profile, onDelete, deleting }: { profile: ContentProfile; onDelete: (id: string) => void; deleting: boolean }) {
  const hooks = safeJsonParse(profile.top_hooks, []);
  const hashtags = safeJsonParse(profile.top_hashtags, []);

  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 20px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>{getNicheEmoji(profile.niche)}</span>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{profile.niche || "Sin nicho"}</span>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 12,
            background: "rgba(99,102,241,0.12)", color: "#6366f1",
          }}>
            {profile.pacing}
          </span>
        </div>
        <button
          onClick={() => onDelete(profile.id)}
          disabled={deleting}
          style={{
            background: "transparent", border: "1px solid var(--border)", borderRadius: 6,
            padding: "4px 10px", fontSize: 11, color: "#ef4444", cursor: "pointer",
            opacity: deleting ? 0.5 : 1,
          }}
        >
          {deleting ? "..." : "Eliminar"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
        <MiniStat label="Duración ideal" value={`${profile.optimal_duration_min}–${profile.optimal_duration_max}s`} />
        <MiniStat label="Preset" value={profile.caption_preset} />
        <MiniStat label="Palabras/frase" value={`${profile.words_per_phrase}`} />
        <MiniStat label="Silence threshold" value={profile.silence_threshold_db} />
        <MiniStat label="Views promedio" value={profile.avg_views?.toLocaleString() ?? "—"} />
        <MiniStat label="Engagement" value={profile.avg_engagement_rate ? `${profile.avg_engagement_rate.toFixed(1)}%` : "—"} />
      </div>

      {hooks.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 4 }}>Top Hooks:</div>
          <div style={{ fontSize: 12, color: "var(--foreground)", lineHeight: 1.6 }}>
            {hooks.slice(0, 3).map((h, i) => (
              <div key={i}>"{String(h)}"</div>
            ))}
          </div>
        </div>
      )}

      {hashtags.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 4 }}>Hashtags:</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {hashtags.slice(0, 8).map((h, i) => (
              <span key={i} style={{ fontSize: 11, background: "var(--muted)", padding: "2px 6px", borderRadius: 4 }}>
                #{String(h)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AutoConfigCard({ config }: { config: AutoConfig }) {
  const platforms = safeJsonParse(config.platforms, []);
  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 20px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>📁 {config.drive_folder_name || "Carpeta"}</div>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 12,
          background: config.enabled ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
          color: config.enabled ? "#22c55e" : "#ef4444",
        }}>
          {config.enabled ? "Activo" : "Inactivo"}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <MiniStat label="Modo" value={config.default_mode} />
        <MiniStat label="Preset" value={config.caption_preset} />
        <MiniStat label="Estrategia" value={config.schedule_strategy} />
        <MiniStat label="Posts/día" value={`${config.posts_per_day}`} />
        <MiniStat label="Días spread" value={`${config.spread_days}`} />
        <MiniStat label="Plataformas" value={platforms.length > 0 ? platforms.map(String).join(", ") : "ninguna"} />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getNicheEmoji(niche: string | null): string {
  const map: Record<string, string> = {
    fitness: "💪", educacion: "📚", humor: "😂", negocios: "💼",
    cocina: "🍳", tech: "💻", belleza: "💄", viajes: "✈️",
    lifestyle: "🌟", gaming: "🎮",
  };
  return niche ? map[niche] ?? "📋" : "📋";
}

function safeJsonParse(raw: string | null | undefined, fallback: unknown[]): unknown[] {
  if (!raw) return fallback;
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : fallback;
  } catch {
    return fallback;
  }
}
