"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type RawData = {
  username?: string;
  platform?: string;
  follower_count?: number;
  post_count?: number;
  scraped_at?: string;
};

type ContentProfile = {
  id: string;
  niche: string | null;
  sub_niches: string;
  optimal_duration_min: number;
  optimal_duration_max: number;
  pacing: string;
  avg_views: number | null;
  avg_engagement_rate: number | null;
  top_hooks: string;
  top_hashtags: string;
  best_posting_times: string;
  raw_data: string | null;
  updated_at: string;
};

type ReferencePost = {
  id: string;
  source_username: string | null;
  hook_phrase: string | null;
  caption: string | null;
  duration_seconds: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  engagement_rate: number | null;
  posted_at: string | null;
};

type InstagramData = {
  profile: ContentProfile | null;
  posts: ReferencePost[];
  apifyConnected: boolean;
};

function safeJsonParse<T>(val: string | null | undefined, fallback: T): T {
  try { return val ? JSON.parse(val) : fallback; } catch { return fallback; }
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function KPICard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10,
      padding: "16px 20px",
    }}>
      <div style={{ fontSize: 11, color: "var(--muted-foreground)", fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function InstagramDashboard() {
  const [data, setData] = useState<InstagramData | null>(null);
  const [loading, setLoading] = useState(true);
  const [rescrapingId, setRescrapingId] = useState(false);

  useEffect(() => {
    fetch("/api/dashboard/instagram")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleRescrape = async (username: string) => {
    setRescrapingId(true);
    try {
      await fetch("/api/references/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: `@${username}`, profileId: data?.profile?.id }),
      });
      // Refresh data
      const r = await fetch("/api/dashboard/instagram");
      const d = await r.json();
      setData(d);
    } catch { /* ignore */ }
    setRescrapingId(false);
  };

  if (loading) {
    return (
      <div style={{ padding: 40, color: "var(--muted-foreground)", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 16, height: 16, border: "2px solid var(--accent)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        Cargando analytics...
      </div>
    );
  }

  if (!data?.profile) {
    return (
      <div style={{ padding: "32px 40px", maxWidth: 700 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <Link href="/dashboard" style={{ color: "var(--muted-foreground)", textDecoration: "none", fontSize: 13 }}>← Dashboard</Link>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 8 }}>Instagram Analytics</h1>
        <div style={{
          background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12,
          padding: 40, textAlign: "center", marginTop: 32,
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Sin cuenta principal configurada</div>
          <div style={{ color: "var(--muted-foreground)", fontSize: 14, maxWidth: 420, margin: "0 auto 24px" }}>
            Conectá tu cuenta de Instagram para analizar qué contenido funciona mejor y que Claude use esos datos para puntuar tus clips.
          </div>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            {data?.apifyConnected ? (
              <Link
                href="/settings?tab=profiles"
                style={{
                  background: "var(--accent)", color: "#fff", padding: "10px 20px",
                  borderRadius: 8, textDecoration: "none", fontSize: 13, fontWeight: 600,
                }}
              >
                Ir a Perfiles →
              </Link>
            ) : (
              <Link
                href="/settings"
                style={{
                  background: "var(--accent)", color: "#fff", padding: "10px 20px",
                  borderRadius: 8, textDecoration: "none", fontSize: 13, fontWeight: 600,
                }}
              >
                Conectar Apify →
              </Link>
            )}
          </div>
          {data?.apifyConnected && (
            <div style={{ marginTop: 16, fontSize: 12, color: "var(--muted-foreground)" }}>
              Apify conectado. Scrapéá tu cuenta en Configuración → Perfiles y marcá el resultado como "Cuenta principal".
            </div>
          )}
        </div>
      </div>
    );
  }

  const { profile, posts, apifyConnected } = data;
  const rawData = safeJsonParse<RawData>(profile.raw_data, {});
  const username = rawData.username ?? "cuenta";
  const followerCount = rawData.follower_count;
  const scrapedAt = rawData.scraped_at ? new Date(rawData.scraped_at).toLocaleDateString("es-AR") : null;
  const hooks: string[] = safeJsonParse(profile.top_hooks, []);
  const hashtags: string[] = safeJsonParse(profile.top_hashtags, []);

  return (
    <div style={{ padding: "32px 40px", maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <Link href="/dashboard" style={{ color: "var(--muted-foreground)", textDecoration: "none", fontSize: 13 }}>← Dashboard</Link>
      </div>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>@{username}</h1>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 12,
              background: "rgba(225,48,108,0.12)", color: "#E1306C",
            }}>
              Instagram
            </span>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 12,
              background: "rgba(34,197,94,0.12)", color: "#22c55e",
            }}>
              Cuenta principal
            </span>
          </div>
          {scrapedAt && (
            <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
              Último análisis: {scrapedAt}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {apifyConnected ? (
            <button
              onClick={() => handleRescrape(username)}
              disabled={rescrapingId}
              style={{
                background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8,
                padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                opacity: rescrapingId ? 0.6 : 1,
              }}
            >
              {rescrapingId ? "Analizando..." : "Re-analizar"}
            </button>
          ) : (
            <Link
              href="/settings"
              style={{
                background: "var(--card)", color: "var(--foreground)", border: "1px solid var(--border)",
                borderRadius: 8, padding: "8px 16px", fontSize: 13, textDecoration: "none",
              }}
            >
              Conectar Apify para actualizar
            </Link>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 28 }}>
        <KPICard label="Views promedio" value={fmt(profile.avg_views)} />
        <KPICard label="Engagement" value={profile.avg_engagement_rate ? `${profile.avg_engagement_rate.toFixed(1)}%` : "—"} />
        <KPICard label="Seguidores" value={fmt(followerCount)} />
        <KPICard label="Duración ideal" value={`${profile.optimal_duration_min}–${profile.optimal_duration_max}s`} sub={profile.pacing} />
        <KPICard label="Nicho" value={profile.niche ?? "—"} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>
        {/* Top Hooks */}
        {hooks.length > 0 && (
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 20px" }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Top Ganchos</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {hooks.slice(0, 8).map((hook, i) => (
                <div key={i} style={{
                  fontSize: 12, padding: "8px 12px", borderRadius: 6,
                  borderLeft: "3px solid #E1306C",
                  background: "rgba(225,48,108,0.05)",
                  lineHeight: 1.4,
                }}>
                  "{hook}"
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Hashtags */}
        {hashtags.length > 0 && (
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 20px" }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Hashtags efectivos</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {hashtags.slice(0, 20).map((tag, i) => (
                <span key={i} style={{
                  fontSize: 12, padding: "4px 10px", borderRadius: 20,
                  background: "var(--muted)", color: "var(--foreground)",
                }}>
                  #{tag}
                </span>
              ))}
            </div>

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Cómo impacta en tus clips</div>
              <div style={{ fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.6 }}>
                Claude usa estos ganchos y el historial de tu cuenta para evaluar qué momentos de tus videos tienen mayor potencial viral. Los clips que arrancan con estructuras similares a las que ya funcionaron en tu cuenta reciben mayor puntaje.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Top Posts Table */}
      {posts.length > 0 && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Posts más exitosos</div>
            <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{posts.length} posts analizados · ordenados por engagement</div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Hook", "Views", "Likes", "Duración", "Engagement"].map((col) => (
                    <th key={col} style={{
                      padding: "10px 16px", textAlign: "left", fontSize: 11,
                      fontWeight: 600, color: "var(--muted-foreground)", whiteSpace: "nowrap",
                    }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {posts.slice(0, 20).map((post) => (
                  <tr key={post.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 16px", maxWidth: 280 }}>
                      <div style={{
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        color: "var(--foreground)",
                      }}>
                        {post.hook_phrase || post.caption?.slice(0, 80) || "—"}
                      </div>
                    </td>
                    <td style={{ padding: "10px 16px", whiteSpace: "nowrap", color: "var(--muted-foreground)" }}>
                      {fmt(post.views)}
                    </td>
                    <td style={{ padding: "10px 16px", whiteSpace: "nowrap", color: "var(--muted-foreground)" }}>
                      {fmt(post.likes)}
                    </td>
                    <td style={{ padding: "10px 16px", whiteSpace: "nowrap", color: "var(--muted-foreground)" }}>
                      {post.duration_seconds ? `${post.duration_seconds}s` : "—"}
                    </td>
                    <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                      <span style={{
                        fontWeight: 700,
                        color: (post.engagement_rate ?? 0) > 5 ? "#22c55e" : "var(--foreground)",
                      }}>
                        {post.engagement_rate != null ? `${post.engagement_rate.toFixed(1)}%` : "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
