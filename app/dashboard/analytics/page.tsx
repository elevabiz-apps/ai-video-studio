"use client";

import { useEffect, useState } from "react";

type Post = {
  upload_id: string;
  platform: string;
  status: string;
  caption: string | null;
  url: string | null;
  published_at: string | null;
  created_at: string;
  clip_name: string | null;
  hook_phrase: string | null;
  ai_score: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  engagement_rate: number | null;
};

type TrendPoint = { week: string; views: number; posts: number };
type CorrelationPoint = { aiScore: number; engagementRate: number; views: number; clipName: string; platform: string };

type AnalyticsData = {
  posts: Post[];
  stats: {
    totalPosts: number;
    publishedPosts: number;
    scheduledPosts: number;
    postsWithMetrics: number;
    totalViews: number;
    avgEngagementRate: number;
    bestPost: { clipName: string; platform: string; views: number; engagementRate: number } | null;
  };
  trendsData: TrendPoint[];
  correlationData: CorrelationPoint[];
  pearsonCorrelation: number | null;
};

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState("all");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/analytics?platform=${platform}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [platform]);

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1200 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 6 }}>Analytics</h1>
          <p style={{ color: "var(--muted-foreground)", fontSize: 14 }}>
            Rendimiento de tus publicaciones y correlación con scoring IA
          </p>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {["all", "tiktok", "instagram", "youtube", "twitter", "linkedin"].map((p) => (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              style={{
                padding: "5px 12px", fontSize: 12, fontWeight: 600, borderRadius: 6,
                border: "none", cursor: "pointer",
                background: platform === p ? "var(--accent)" : "var(--muted)",
                color: platform === p ? "white" : "var(--muted-foreground)",
              }}
            >
              {p === "all" ? "Todas" : platformLabel(p)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--muted-foreground)" }}>
          <div style={{ width: 16, height: 16, border: "2px solid var(--accent)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          Cargando datos...
        </div>
      ) : !data ? (
        <div style={{ color: "var(--muted-foreground)" }}>Error cargando datos</div>
      ) : (
        <>
          {/* Stats Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
            <BigStatCard label="Posts publicados" value={data.stats.publishedPosts} sub={`${data.stats.scheduledPosts} programados`} />
            <BigStatCard label="Vistas totales" value={data.stats.totalViews} format="number" />
            <BigStatCard label="Engagement promedio" value={data.stats.avgEngagementRate} format="percent" />
            <BigStatCard label="Vistas promedio" value={data.stats.totalViews > 0 && data.stats.postsWithMetrics > 0 ? Math.round(data.stats.totalViews / data.stats.postsWithMetrics) : 0} format="number" />
          </div>

          {/* Best Post + Correlation */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
            {/* Best Post */}
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "18px 20px" }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "var(--muted-foreground)" }}>
                🏆 Mejor Post
              </h3>
              {data.stats.bestPost ? (
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{data.stats.bestPost.clipName}</div>
                  <div style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
                    {platformLabel(data.stats.bestPost.platform)} · {(data.stats.bestPost.views ?? 0).toLocaleString()} vistas · {(data.stats.bestPost.engagementRate ?? 0).toFixed(1)}% ER
                  </div>
                </div>
              ) : (
                <div style={{ color: "var(--muted-foreground)", fontSize: 13, fontStyle: "italic" }}>
                  Sin datos de posts todavía
                </div>
              )}
            </div>

            {/* AI Score Correlation */}
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "18px 20px" }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "var(--muted-foreground)" }}>
                🧠 Correlación IA Score vs Engagement
              </h3>
              {data.pearsonCorrelation !== null ? (
                <div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 32, fontWeight: 800, color: getCorrelationColor(data.pearsonCorrelation) }}>
                      {data.pearsonCorrelation.toFixed(2)}
                    </span>
                    <span style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
                      Pearson ({data.correlationData.length} posts)
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 4 }}>
                    {getCorrelationLabel(data.pearsonCorrelation)}
                  </div>
                </div>
              ) : (
                <div style={{ color: "var(--muted-foreground)", fontSize: 13, fontStyle: "italic" }}>
                  Se necesitan al menos 5 posts con métricas y score IA
                </div>
              )}
            </div>
          </div>

          {/* Trends Chart (text-based) */}
          {data.trendsData.length > 0 && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "18px 20px", marginBottom: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: "var(--muted-foreground)" }}>
                📈 Tendencia semanal (vistas)
              </h3>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 120 }}>
                {data.trendsData.map((t) => {
                  const maxViews = Math.max(...data.trendsData.map((d) => d.views), 1);
                  const height = Math.max(4, (t.views / maxViews) * 100);
                  return (
                    <div key={t.week} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <div style={{ fontSize: 9, color: "var(--muted-foreground)" }}>{t.views > 0 ? abbreviate(t.views) : ""}</div>
                      <div style={{
                        width: "100%", height: `${height}%`, background: "var(--accent)",
                        borderRadius: "4px 4px 0 0", minHeight: 4,
                      }} title={`${t.week}: ${t.views} vistas, ${t.posts} posts`} />
                      <div style={{ fontSize: 8, color: "var(--muted-foreground)", transform: "rotate(-45deg)", whiteSpace: "nowrap" }}>
                        {t.week.slice(5)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Posts Table */}
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "18px 20px" }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: "var(--muted-foreground)" }}>
              📋 Posts ({data.posts.length})
            </h3>
            {data.posts.length === 0 ? (
              <div style={{ color: "var(--muted-foreground)", fontSize: 13, fontStyle: "italic", textAlign: "center", padding: 24 }}>
                No hay posts todavía. Procesá un video y publicalo para ver datos acá.
              </div>
            ) : (
              <div style={{ maxHeight: 500, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <th style={thStyle}>Clip</th>
                      <th style={thStyle}>Plataforma</th>
                      <th style={thStyle}>Score IA</th>
                      <th style={thStyle}>Vistas</th>
                      <th style={thStyle}>Likes</th>
                      <th style={thStyle}>ER</th>
                      <th style={thStyle}>Estado</th>
                      <th style={thStyle}>Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.posts.map((p) => (
                      <tr key={p.upload_id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={tdStyle}>
                          <div style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {p.hook_phrase || p.clip_name || "Sin nombre"}
                          </div>
                        </td>
                        <td style={tdStyle}>{platformLabel(p.platform)}</td>
                        <td style={{ ...tdStyle, color: p.ai_score ? getScoreColor(p.ai_score) : "var(--muted-foreground)", fontWeight: 700 }}>
                          {p.ai_score ?? "—"}
                        </td>
                        <td style={tdStyle}>{p.views?.toLocaleString() ?? "—"}</td>
                        <td style={tdStyle}>{p.likes?.toLocaleString() ?? "—"}</td>
                        <td style={tdStyle}>{p.engagement_rate ? `${p.engagement_rate.toFixed(1)}%` : "—"}</td>
                        <td style={tdStyle}>
                          <PostStatusBadge status={p.status} />
                        </td>
                        <td style={{ ...tdStyle, color: "var(--muted-foreground)" }}>
                          {formatDate(p.published_at || p.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Back link */}
          <div style={{ marginTop: 24 }}>
            <a href="/dashboard" style={{
              padding: "8px 16px", background: "var(--muted)", color: "var(--foreground)",
              textDecoration: "none", borderRadius: 8, fontWeight: 600, fontSize: 14,
            }}>
              ← Volver a Automatización
            </a>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function BigStatCard({ label, value, sub, format }: {
  label: string; value: number; sub?: string; format?: "number" | "percent";
}) {
  const display = format === "percent" ? `${value.toFixed(1)}%`
    : format === "number" ? value.toLocaleString()
    : value.toString();
  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10,
      padding: "18px 20px",
    }}>
      <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{display}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function PostStatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    published: { bg: "rgba(34,197,94,0.12)", color: "#22c55e", label: "Publicado" },
    scheduled: { bg: "rgba(99,102,241,0.12)", color: "#6366f1", label: "Programado" },
    pending: { bg: "rgba(245,158,11,0.12)", color: "#f59e0b", label: "Pendiente" },
    uploading: { bg: "rgba(99,102,241,0.12)", color: "#6366f1", label: "Subiendo" },
    failed: { bg: "rgba(239,68,68,0.12)", color: "#ef4444", label: "Error" },
  };
  const s = map[status] ?? { bg: "var(--muted)", color: "var(--muted-foreground)", label: status };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 10,
      background: s.bg, color: s.color,
    }}>
      {s.label}
    </span>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  textAlign: "left", padding: "8px 6px", fontWeight: 600, color: "var(--muted-foreground)", fontSize: 11,
};
const tdStyle: React.CSSProperties = {
  padding: "8px 6px", fontSize: 12,
};

function platformLabel(p: string): string {
  const map: Record<string, string> = {
    tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube",
    twitter: "Twitter/X", linkedin: "LinkedIn", facebook: "Facebook", pinterest: "Pinterest",
  };
  return map[p] ?? p;
}

function getScoreColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#f59e0b";
  if (score >= 40) return "#f97316";
  return "#ef4444";
}

function getCorrelationColor(r: number): string {
  const abs = Math.abs(r);
  if (abs >= 0.7) return "#22c55e";
  if (abs >= 0.4) return "#f59e0b";
  return "#ef4444";
}

function getCorrelationLabel(r: number): string {
  const abs = Math.abs(r);
  if (abs >= 0.7) return "Correlación fuerte — el scoring IA predice bien el engagement";
  if (abs >= 0.4) return "Correlación moderada — el scoring tiene utilidad parcial";
  return "Correlación débil — el scoring necesita calibración";
}

function abbreviate(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
  } catch {
    return iso;
  }
}
