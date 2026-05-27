"use client";

import { useState, useEffect, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Post {
  upload_id: string;
  platform: string;
  external_post_id: string | null;
  status: string;
  caption: string | null;
  url: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  created_at: string;
  clip_name: string | null;
  hook_phrase: string | null;
  ai_score: number | null;
  start_seconds: number | null;
  end_seconds: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  engagement_rate: number | null;
  retention_rate: number | null;
  metrics_fetched_at: string | null;
}

interface Stats {
  totalPosts: number;
  publishedPosts: number;
  scheduledPosts: number;
  postsWithMetrics: number;
  totalViews: number;
  avgEngagementRate: number;
  bestPost: { clipName: string; platform: string; views: number | null; engagementRate: number | null } | null;
}

interface TrendPoint {
  week: string;
  views: number;
  posts: number;
}

interface CorrelationPoint {
  aiScore: number;
  engagementRate: number;
  views: number;
  clipName: string;
  platform: string;
}

interface AnalyticsData {
  posts: Post[];
  stats: Stats;
  trendsData: TrendPoint[];
  correlationData: CorrelationPoint[];
  pearsonCorrelation: number | null;
}

type SortKey = "clip_name" | "platform" | "ai_score" | "views" | "likes" | "comments" | "engagement_rate" | "published_at";
type SortDir = "asc" | "desc";

const PLATFORMS = ["all", "tiktok", "instagram", "youtube", "twitter", "linkedin", "facebook", "pinterest"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

function platformColor(p: string) {
  const map: Record<string, string> = {
    tiktok: "rgba(0,0,0,0.25)",
    instagram: "rgba(217,70,239,0.25)",
    youtube: "rgba(239,68,68,0.25)",
    twitter: "rgba(59,130,246,0.25)",
    linkedin: "rgba(0,102,204,0.25)",
    facebook: "rgba(59,130,246,0.25)",
    pinterest: "rgba(239,68,68,0.25)",
  };
  return map[p.toLowerCase()] ?? "rgba(100,100,100,0.2)";
}

function statusBadge(status: string) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    published: { bg: "rgba(34,197,94,0.2)", text: "#22c55e", label: "Publicado" },
    scheduled: { bg: "rgba(249,115,22,0.2)", text: "#f97316", label: "Programado" },
    pending: { bg: "rgba(99,102,241,0.2)", text: "#6366f1", label: "Pendiente" },
    failed: { bg: "rgba(239,68,68,0.2)", text: "#ef4444", label: "Error" },
  };
  const s = map[status] ?? map.pending;
  return (
    <span style={{ background: s.bg, color: s.text, padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
      {s.label}
    </span>
  );
}

function exportCSV(posts: Post[]) {
  const headers = [
    "Clip", "Plataforma", "Estado", "AI Score",
    "Views", "Likes", "Comments", "Shares", "Saves",
    "Engagement Rate (%)", "Publicado",
  ];
  const rows = posts.map((p) => [
    `"${(p.clip_name ?? p.hook_phrase ?? "").replace(/"/g, '""')}"`,
    p.platform,
    p.status,
    p.ai_score ?? "",
    p.views ?? "",
    p.likes ?? "",
    p.comments ?? "",
    p.shares ?? "",
    p.saves ?? "",
    p.engagement_rate ?? "",
    p.published_at ? new Date(p.published_at).toLocaleDateString("es-AR") : "",
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `analytics_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function sortPosts(posts: Post[], key: SortKey, dir: SortDir): Post[] {
  return [...posts].sort((a, b) => {
    let va: string | number | null;
    let vb: string | number | null;
    switch (key) {
      case "clip_name":    va = a.clip_name ?? a.hook_phrase ?? ""; vb = b.clip_name ?? b.hook_phrase ?? ""; break;
      case "platform":     va = a.platform; vb = b.platform; break;
      case "ai_score":     va = a.ai_score; vb = b.ai_score; break;
      case "views":        va = a.views; vb = b.views; break;
      case "likes":        va = a.likes; vb = b.likes; break;
      case "comments":     va = a.comments; vb = b.comments; break;
      case "engagement_rate": va = a.engagement_rate; vb = b.engagement_rate; break;
      case "published_at": va = a.published_at ?? a.created_at; vb = b.published_at ?? b.created_at; break;
      default: return 0;
    }
    if (va === null) return 1;
    if (vb === null) return -1;
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return dir === "asc" ? cmp : -cmp;
  });
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  // Filters
  const [platform, setPlatform] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [status, setStatus] = useState("published");

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>("published_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (platform !== "all") params.append("platform", platform);
      if (dateFrom) params.append("dateFrom", dateFrom);
      if (dateTo) params.append("dateTo", dateTo);
      if (status !== "all") params.append("status", status);
      const res = await fetch(`/api/dashboard/analytics?${params}`);
      if (!res.ok) throw new Error("Failed to load analytics");
      setData(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [platform, dateFrom, dateTo, status]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRefreshMetrics = async () => {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const res = await fetch("/api/cron/collect-metrics");
      const json = await res.json();
      setRefreshMsg(`Recolectadas ${json.collected ?? 0} métricas${json.errors?.length ? ` (${json.errors.length} errores)` : ""}`);
      await fetchData();
    } catch {
      setRefreshMsg("Error al recolectar métricas");
    } finally {
      setRefreshing(false);
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const sortedPosts = data ? sortPosts(data.posts, sortKey, sortDir) : [];

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1400, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <a href="/dashboard" style={{ color: "var(--muted-foreground)", textDecoration: "none", fontSize: 13 }}>
              ← Automatización
            </a>
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>Analytics</h1>
          <p style={{ color: "var(--muted-foreground)", fontSize: 14 }}>
            Métricas de todos los posts publicados
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {refreshMsg && (
            <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{refreshMsg}</span>
          )}
          <button
            onClick={handleRefreshMetrics}
            disabled={refreshing}
            style={{
              background: refreshing ? "var(--muted)" : "rgba(99,102,241,0.15)",
              color: "#6366f1",
              border: "1px solid rgba(99,102,241,0.3)",
              borderRadius: 8,
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 600,
              cursor: refreshing ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {refreshing ? "Recolectando..." : "🔄 Actualizar métricas"}
          </button>
          {data && (
            <button
              onClick={() => exportCSV(sortedPosts)}
              style={{
                background: "rgba(34,197,94,0.15)",
                color: "#22c55e",
                border: "1px solid rgba(34,197,94,0.3)",
                borderRadius: 8,
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              ⬇ Exportar CSV
            </button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      {data && <StatsCards stats={data.stats} />}

      {/* Filters */}
      <FilterBar
        platform={platform} setPlatform={setPlatform}
        dateFrom={dateFrom} setDateFrom={setDateFrom}
        dateTo={dateTo} setDateTo={setDateTo}
        status={status} setStatus={setStatus}
        onClear={() => { setPlatform("all"); setDateFrom(""); setDateTo(""); setStatus("published"); }}
      />

      {/* Error */}
      {error && (
        <div style={{ color: "var(--destructive)", padding: 16, textAlign: "center", marginBottom: 24 }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ color: "var(--muted-foreground)", padding: 24, textAlign: "center" }}>
          Cargando analytics...
        </div>
      )}

      {/* Charts */}
      {!loading && data && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 32 }}>
          <TrendsChart data={data.trendsData} />
          <CorrelationChart data={data.correlationData} pearson={data.pearsonCorrelation} />
        </div>
      )}

      {/* Table */}
      {!loading && data && (
        <PostsTable
          posts={sortedPosts}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
        />
      )}
    </div>
  );
}

// ─── Stats Cards ─────────────────────────────────────────────────────────────

function StatsCards({ stats }: { stats: Stats }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 32 }}>
      {[
        { label: "Publicados", value: stats.publishedPosts, color: "#22c55e" },
        { label: "Con métricas", value: stats.postsWithMetrics, color: "#6366f1" },
        { label: "Views totales", value: fmt(stats.totalViews), color: "#f59e0b" },
        { label: "Engagement prom.", value: `${stats.avgEngagementRate}%`, color: "#ef4444" },
      ].map((c) => (
        <div key={c.label} style={{ background: "var(--muted)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: c.color, marginBottom: 4 }}>{c.value}</div>
          <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{c.label}</div>
        </div>
      ))}
      {stats.bestPost && (
        <div style={{ background: "var(--muted)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, gridColumn: "1 / -1" }}>
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 4, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>
            🏆 Mejor post
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {stats.bestPost.clipName}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>
            {stats.bestPost.platform} · {fmt(stats.bestPost.views)} views · {stats.bestPost.engagementRate?.toFixed(2)}% ER
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────

function FilterBar({
  platform, setPlatform,
  dateFrom, setDateFrom,
  dateTo, setDateTo,
  status, setStatus,
  onClear,
}: {
  platform: string; setPlatform: (v: string) => void;
  dateFrom: string; setDateFrom: (v: string) => void;
  dateTo: string; setDateTo: (v: string) => void;
  status: string; setStatus: (v: string) => void;
  onClear: () => void;
}) {
  const selectStyle: React.CSSProperties = {
    background: "var(--card)", border: "1px solid var(--border)",
    borderRadius: 6, padding: "6px 10px", fontSize: 13,
    color: "var(--foreground)", cursor: "pointer",
  };
  const inputStyle: React.CSSProperties = { ...selectStyle, cursor: "text" };
  const labelStyle: React.CSSProperties = { fontSize: 12, color: "var(--muted-foreground)", display: "block", marginBottom: 4 };

  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
      <div>
        <label style={labelStyle}>Plataforma</label>
        <select value={platform} onChange={(e) => setPlatform(e.target.value)} style={selectStyle}>
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>{p === "all" ? "Todas" : p.charAt(0).toUpperCase() + p.slice(1)}</option>
          ))}
        </select>
      </div>
      <div>
        <label style={labelStyle}>Desde</label>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Hasta</label>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Estado</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle}>
          <option value="published">Publicados</option>
          <option value="scheduled">Programados</option>
          <option value="all">Todos</option>
        </select>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end" }}>
        <button onClick={onClear} style={{ ...selectStyle, fontWeight: 600 }}>
          Limpiar filtros
        </button>
      </div>
    </div>
  );
}

// ─── Trends Chart ─────────────────────────────────────────────────────────────

function TrendsChart({ data }: { data: TrendPoint[] }) {
  const W = 520, H = 160, PL = 50, PR = 16, PT = 16, PB = 32;
  const chartW = W - PL - PR;
  const chartH = H - PT - PB;

  if (data.length < 2) {
    return (
      <div style={{ background: "var(--muted)", border: "1px solid var(--border)", borderRadius: 12, padding: 24, textAlign: "center", color: "var(--muted-foreground)", fontSize: 13 }}>
        Necesitás más publicaciones para ver tendencias
      </div>
    );
  }

  const maxViews = Math.max(...data.map((d) => d.views), 1);
  const pts = data.map((d, i) => ({
    x: PL + (i / (data.length - 1)) * chartW,
    y: PT + chartH - (d.views / maxViews) * chartH,
    d,
  }));

  // Smooth polyline
  const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const fillD = `${pathD} L${pts[pts.length - 1].x.toFixed(1)},${(PT + chartH).toFixed(1)} L${PL},${(PT + chartH).toFixed(1)} Z`;

  // Y-axis labels: 0, max/2, max
  const yLabels = [
    { val: maxViews, y: PT },
    { val: Math.round(maxViews / 2), y: PT + chartH / 2 },
    { val: 0, y: PT + chartH },
  ];

  // X-axis: show 4 evenly-spaced labels
  const xStep = Math.max(1, Math.floor((data.length - 1) / 3));
  const xLabels = pts.filter((_, i) => i % xStep === 0 || i === pts.length - 1);

  return (
    <div style={{ background: "var(--muted)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>📈 Views por semana</div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {/* Grid lines */}
        {yLabels.map(({ y }) => (
          <line key={y} x1={PL} y1={y} x2={W - PR} y2={y} stroke="var(--border)" strokeWidth={1} />
        ))}
        {/* Area fill */}
        <path d={fillD} fill="url(#grad)" />
        {/* Line */}
        <path d={pathD} fill="none" stroke="#6366f1" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {/* Dots */}
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill="#6366f1" />
        ))}
        {/* Y labels */}
        {yLabels.map(({ val, y }) => (
          <text key={y} x={PL - 6} y={y + 4} textAnchor="end" fontSize={9} fill="var(--muted-foreground)">
            {fmt(val)}
          </text>
        ))}
        {/* X labels */}
        {xLabels.map((p) => (
          <text key={p.d.week} x={p.x} y={H - 4} textAnchor="middle" fontSize={9} fill="var(--muted-foreground)">
            {p.d.week.slice(5)} {/* MM-DD */}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ─── Correlation Chart ────────────────────────────────────────────────────────

function CorrelationChart({ data, pearson }: { data: CorrelationPoint[]; pearson: number | null }) {
  const W = 520, H = 200, PL = 48, PR = 16, PT = 16, PB = 32;
  const chartW = W - PL - PR;
  const chartH = H - PT - PB;

  if (data.length < 5) {
    return (
      <div style={{ background: "var(--muted)", border: "1px solid var(--border)", borderRadius: 12, padding: 24, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted-foreground)", fontSize: 13, textAlign: "center" }}>
        Necesitás al menos 5 posts con métricas para ver la correlación entre score IA y engagement
      </div>
    );
  }

  const maxER = Math.max(...data.map((d) => d.engagementRate), 1);
  const maxScore = 100;

  const pts = data.map((d) => ({
    x: PL + (d.aiScore / maxScore) * chartW,
    y: PT + chartH - (d.engagementRate / maxER) * chartH,
    d,
  }));

  // Trend line via simple linear regression
  const n = data.length;
  const xs = data.map((d) => d.aiScore);
  const ys = data.map((d) => d.engagementRate);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const intercept = my - slope * mx;

  const lineX1 = 0, lineX2 = maxScore;
  const lineY1 = Math.max(0, Math.min(maxER, slope * lineX1 + intercept));
  const lineY2 = Math.max(0, Math.min(maxER, slope * lineX2 + intercept));
  const px1 = PL + (lineX1 / maxScore) * chartW;
  const py1 = PT + chartH - (lineY1 / maxER) * chartH;
  const px2 = PL + (lineX2 / maxScore) * chartW;
  const py2 = PT + chartH - (lineY2 / maxER) * chartH;

  const yLabels = [
    { val: maxER, y: PT },
    { val: Math.round(maxER / 2 * 10) / 10, y: PT + chartH / 2 },
    { val: 0, y: PT + chartH },
  ];
  const xLabels = [0, 25, 50, 75, 100];

  const pearsonLabel = pearson !== null
    ? pearson > 0.6 ? "Correlación fuerte 🎯" : pearson > 0.3 ? "Correlación moderada" : pearson < -0.3 ? "Correlación inversa" : "Sin correlación clara"
    : "";

  return (
    <div style={{ background: "var(--muted)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>🎯 Score IA vs Engagement Real</div>
        {pearson !== null && (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: pearson > 0.5 ? "#22c55e" : pearson > 0.2 ? "#f59e0b" : "#ef4444" }}>
              r = {pearson}
            </div>
            <div style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{pearsonLabel}</div>
          </div>
        )}
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ overflow: "visible" }}>
        {/* Grid */}
        {yLabels.map(({ y }) => (
          <line key={y} x1={PL} y1={y} x2={W - PR} y2={y} stroke="var(--border)" strokeWidth={1} />
        ))}
        {xLabels.map((v) => {
          const x = PL + (v / maxScore) * chartW;
          return <line key={v} x1={x} y1={PT} x2={x} y2={PT + chartH} stroke="var(--border)" strokeWidth={1} strokeDasharray="3,3" />;
        })}
        {/* Trend line */}
        <line x1={px1} y1={py1} x2={px2} y2={py2} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="5,3" opacity={0.7} />
        {/* Dots */}
        {pts.map((p, i) => (
          <circle
            key={i}
            cx={p.x} cy={p.y} r={4}
            fill={platformColor(p.d.platform)}
            stroke="#6366f1" strokeWidth={1.5}
            opacity={0.85}
          >
            <title>{p.d.clipName} — Score: {p.d.aiScore} | ER: {p.d.engagementRate}%</title>
          </circle>
        ))}
        {/* Y labels */}
        {yLabels.map(({ val, y }) => (
          <text key={y} x={PL - 6} y={y + 4} textAnchor="end" fontSize={9} fill="var(--muted-foreground)">
            {val}%
          </text>
        ))}
        {/* X labels */}
        {xLabels.map((v) => (
          <text key={v} x={PL + (v / maxScore) * chartW} y={H - 4} textAnchor="middle" fontSize={9} fill="var(--muted-foreground)">
            {v}
          </text>
        ))}
        {/* Axis labels */}
        <text x={W / 2} y={H} textAnchor="middle" fontSize={9} fill="var(--muted-foreground)">Score IA →</text>
        <text x={10} y={PT + chartH / 2} textAnchor="middle" fontSize={9} fill="var(--muted-foreground)" transform={`rotate(-90, 10, ${PT + chartH / 2})`}>ER% ↑</text>
      </svg>
    </div>
  );
}

// ─── Posts Table ─────────────────────────────────────────────────────────────

function PostsTable({
  posts,
  sortKey,
  sortDir,
  onSort,
}: {
  posts: Post[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  if (posts.length === 0) {
    return (
      <div style={{ background: "var(--muted)", border: "1px solid var(--border)", borderRadius: 12, padding: 24, textAlign: "center", color: "var(--muted-foreground)" }}>
        No hay posts con esos filtros.
      </div>
    );
  }

  const thStyle = (key: SortKey): React.CSSProperties => ({
    padding: "12px",
    textAlign: "left",
    fontWeight: 700,
    fontSize: 12,
    color: sortKey === key ? "var(--foreground)" : "var(--muted-foreground)",
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
  });

  const arrow = (key: SortKey) => sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : " ↕";

  return (
    <div>
      <div style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 8 }}>
        {posts.length} post{posts.length !== 1 ? "s" : ""}
      </div>
      <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--muted)", borderBottom: "1px solid var(--border)" }}>
              <th style={thStyle("clip_name")} onClick={() => onSort("clip_name")}>
                Clip{arrow("clip_name")}
              </th>
              <th style={thStyle("platform")} onClick={() => onSort("platform")}>
                Plataforma{arrow("platform")}
              </th>
              <th style={{ ...thStyle("ai_score"), textAlign: "right" }} onClick={() => onSort("ai_score")}>
                AI Score{arrow("ai_score")}
              </th>
              <th style={{ ...thStyle("views"), textAlign: "right" }} onClick={() => onSort("views")}>
                Views{arrow("views")}
              </th>
              <th style={{ ...thStyle("likes"), textAlign: "right" }} onClick={() => onSort("likes")}>
                Likes{arrow("likes")}
              </th>
              <th style={{ ...thStyle("comments"), textAlign: "right" }} onClick={() => onSort("comments")}>
                Comments{arrow("comments")}
              </th>
              <th style={{ ...thStyle("engagement_rate"), textAlign: "right" }} onClick={() => onSort("engagement_rate")}>
                Engagement{arrow("engagement_rate")}
              </th>
              <th style={thStyle("published_at")} onClick={() => onSort("published_at")}>
                Publicado{arrow("published_at")}
              </th>
              <th style={{ padding: "12px", textAlign: "center", fontWeight: 700, fontSize: 12, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>
                Estado
              </th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post, idx) => (
              <tr
                key={post.upload_id}
                style={{ borderBottom: "1px solid var(--border)", background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)" }}
              >
                <td style={{ padding: "12px" }}>
                  <div
                    title={post.clip_name ?? post.hook_phrase ?? "Unnamed"}
                    style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {post.clip_name ?? post.hook_phrase ?? "Sin nombre"}
                  </div>
                </td>
                <td style={{ padding: "12px" }}>
                  <span style={{ background: platformColor(post.platform), padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, textTransform: "capitalize" }}>
                    {post.platform}
                  </span>
                </td>
                <td style={{ padding: "12px", textAlign: "right", fontWeight: 700 }}>
                  {post.ai_score !== null ? (
                    <span style={{ color: post.ai_score >= 80 ? "#22c55e" : post.ai_score >= 60 ? "#f59e0b" : "var(--foreground)" }}>
                      {Math.round(post.ai_score)}
                    </span>
                  ) : "—"}
                </td>
                <td style={{ padding: "12px", textAlign: "right", fontWeight: 600 }}>
                  {fmt(post.views)}
                </td>
                <td style={{ padding: "12px", textAlign: "right" }}>
                  {fmt(post.likes)}
                </td>
                <td style={{ padding: "12px", textAlign: "right" }}>
                  {fmt(post.comments)}
                </td>
                <td style={{ padding: "12px", textAlign: "right", fontWeight: 600 }}>
                  {post.engagement_rate !== null ? (
                    <span style={{ color: post.engagement_rate >= 5 ? "#22c55e" : "var(--foreground)" }}>
                      {post.engagement_rate.toFixed(2)}%
                    </span>
                  ) : "—"}
                </td>
                <td style={{ padding: "12px", color: "var(--muted-foreground)", fontSize: 12, whiteSpace: "nowrap" }}>
                  {post.published_at ? new Date(post.published_at).toLocaleDateString("es-AR") : "—"}
                </td>
                <td style={{ padding: "12px", textAlign: "center" }}>
                  {statusBadge(post.status)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
