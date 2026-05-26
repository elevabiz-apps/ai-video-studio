"use client";
import { useState, useEffect, useCallback } from "react";
import type { BlotatoAccount, BlotatoPlatform } from "@/lib/blotato";

const PLATFORM_INFO: Record<string, { label: string; emoji: string; color: string }> = {
  tiktok:    { label: "TikTok",    emoji: "🎵", color: "#ff0050" },
  instagram: { label: "Instagram", emoji: "📸", color: "#e1306c" },
  youtube:   { label: "YouTube",   emoji: "▶️",  color: "#ff0000" },
  twitter:   { label: "X / Twitter", emoji: "𝕏", color: "#1da1f2" },
  linkedin:  { label: "LinkedIn",  emoji: "💼", color: "#0077b5" },
  facebook:  { label: "Facebook",  emoji: "📘", color: "#1877f2" },
  pinterest: { label: "Pinterest", emoji: "📌", color: "#e60023" },
};

interface UploadStatus {
  id: string;
  platform: string;
  status: "pending" | "uploading" | "scheduled" | "published" | "failed";
  url?: string;
  error?: string;
  scheduled_at?: string;
}

interface Props {
  filePath: string;          // e.g. "assets/clip01.mp4" or "renders/render_video_xxx.mp4"
  clipId?: string;
  renderId?: string;
  defaultCaption?: string;
  onClose: () => void;
}

export default function PublishDialog({ filePath, clipId, renderId, defaultCaption = "", onClose }: Props) {
  const [accounts, setAccounts] = useState<BlotatoAccount[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(new Set());
  const [caption, setCaption] = useState(defaultCaption);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");

  const [publishing, setPublishing] = useState(false);
  const [uploadStatuses, setUploadStatuses] = useState<UploadStatus[]>([]);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load connected accounts
  useEffect(() => {
    fetch("/api/publish/accounts")
      .then((r) => r.json())
      .then(({ accounts: accs, configured: cfg }) => {
        setAccounts(accs ?? []);
        setConfigured(cfg ?? false);
        // Pre-select all connected platforms
        const platforms = new Set<string>((accs ?? []).map((a: BlotatoAccount) => a.platform));
        setSelectedPlatforms(platforms);
      })
      .catch(() => setConfigured(false))
      .finally(() => setLoadingAccounts(false));
  }, []);

  // Poll upload statuses
  const pollStatuses = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const results = await Promise.all(
      ids.map((id) =>
        fetch(`/api/publish/${id}`, { cache: "no-store" })
          .then((r) => r.json())
          .catch(() => null)
      )
    );
    const statuses = results.filter(Boolean) as UploadStatus[];
    setUploadStatuses(statuses);

    const allDone = statuses.every(
      (s) => s.status === "published" || s.status === "scheduled" || s.status === "failed"
    );
    if (!allDone) {
      setTimeout(() => pollStatuses(ids), 2000);
    } else {
      setDone(true);
      setPublishing(false);
    }
  }, []);

  const handlePublish = async () => {
    if (selectedPlatforms.size === 0) {
      setError("Seleccioná al menos una plataforma");
      return;
    }
    setError(null);
    setPublishing(true);
    setUploadStatuses([]);

    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath,
          platforms: Array.from(selectedPlatforms),
          caption,
          clipId,
          renderId,
          scheduledAt: scheduleEnabled && scheduledAt ? scheduledAt : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al publicar");
      const { uploadIds } = data as { uploadIds: string[] };
      // Start polling
      await pollStatuses(uploadIds);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      setPublishing(false);
    }
  };

  const togglePlatform = (platform: string) => {
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });
  };

  // Get unique platforms from connected accounts
  const availablePlatforms = Array.from(
    new Set(accounts.map((a) => a.platform))
  ) as BlotatoPlatform[];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: 28,
          width: "100%",
          maxWidth: 480,
          maxHeight: "90vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--foreground)" }}>
            📤 Publicar en redes sociales
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--muted-foreground)",
              cursor: "pointer",
              fontSize: 20,
              lineHeight: 1,
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* Not configured */}
        {!configured && !loadingAccounts && (
          <div
            style={{
              background: "rgba(255,165,0,0.1)",
              border: "1px solid rgba(255,165,0,0.3)",
              borderRadius: 8,
              padding: 14,
              fontSize: 13,
              color: "var(--foreground)",
              lineHeight: 1.5,
            }}
          >
            ⚠️ <strong>BLOTATO_API_KEY no configurada.</strong><br />
            Agregá la variable de entorno en Railway para habilitar la publicación automática.
            <a
              href="https://blotato.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--accent)", display: "block", marginTop: 8 }}
            >
              → Obtener API key en Blotato
            </a>
          </div>
        )}

        {/* Loading accounts */}
        {loadingAccounts && (
          <div style={{ color: "var(--muted-foreground)", fontSize: 13, textAlign: "center", padding: 20 }}>
            Cargando cuentas conectadas...
          </div>
        )}

        {/* Platform selection */}
        {configured && !loadingAccounts && !publishing && !done && (
          <>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", marginBottom: 10 }}>
                Plataformas
              </div>
              {availablePlatforms.length === 0 ? (
                <div
                  style={{
                    background: "rgba(100,100,100,0.1)",
                    borderRadius: 8,
                    padding: 14,
                    fontSize: 13,
                    color: "var(--muted-foreground)",
                    textAlign: "center",
                  }}
                >
                  No hay cuentas conectadas en Blotato.<br />
                  <a
                    href="https://app.blotato.com/settings/accounts"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "var(--accent)" }}
                  >
                    → Conectar cuentas en Blotato
                  </a>
                </div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {availablePlatforms.map((platform) => {
                    const info = PLATFORM_INFO[platform] ?? { label: platform, emoji: "🌐", color: "#666" };
                    const selected = selectedPlatforms.has(platform);
                    return (
                      <button
                        key={platform}
                        onClick={() => togglePlatform(platform)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "7px 14px",
                          borderRadius: 20,
                          border: `2px solid ${selected ? info.color : "var(--border)"}`,
                          background: selected ? `${info.color}22` : "transparent",
                          color: selected ? info.color : "var(--muted-foreground)",
                          cursor: "pointer",
                          fontSize: 13,
                          fontWeight: selected ? 700 : 400,
                          transition: "all 0.15s",
                        }}
                      >
                        <span>{info.emoji}</span>
                        <span>{info.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Caption */}
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", display: "block", marginBottom: 8 }}>
                Caption / descripción
              </label>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Escribí tu caption con hashtags... #viral #shorts"
                rows={4}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--input)",
                  color: "var(--foreground)",
                  fontSize: 13,
                  resize: "vertical",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
              <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 4 }}>
                {caption.length} caracteres
              </div>
            </div>

            {/* Scheduling */}
            <div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={scheduleEnabled}
                  onChange={(e) => setScheduleEnabled(e.target.checked)}
                  style={{ width: 16, height: 16, cursor: "pointer" }}
                />
                <span style={{ fontWeight: 600, color: "var(--foreground)" }}>Programar publicación</span>
              </label>
              {scheduleEnabled && (
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                  style={{
                    marginTop: 10,
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--input)",
                    color: "var(--foreground)",
                    fontSize: 13,
                    boxSizing: "border-box",
                  }}
                />
              )}
            </div>

            {/* Error */}
            {error && (
              <div style={{ color: "var(--destructive)", fontSize: 13, background: "rgba(220,50,50,0.1)", borderRadius: 8, padding: "10px 14px" }}>
                ✕ {error}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={onClose}
                style={{
                  padding: "9px 18px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--foreground)",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handlePublish}
                disabled={selectedPlatforms.size === 0 || availablePlatforms.length === 0}
                style={{
                  padding: "9px 22px",
                  borderRadius: 8,
                  border: "none",
                  background: selectedPlatforms.size === 0 ? "var(--muted)" : "var(--accent)",
                  color: "#fff",
                  cursor: selectedPlatforms.size === 0 ? "not-allowed" : "pointer",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {scheduleEnabled ? "⏰ Programar" : "📤 Publicar ahora"}
              </button>
            </div>
          </>
        )}

        {/* Publishing progress */}
        {publishing && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>
              Publicando...
            </div>
            {uploadStatuses.length === 0 ? (
              <div style={{ color: "var(--muted-foreground)", fontSize: 13 }}>
                Subiendo video a Blotato...
              </div>
            ) : (
              uploadStatuses.map((s) => {
                const info = PLATFORM_INFO[s.platform] ?? { label: s.platform, emoji: "🌐", color: "#666" };
                return (
                  <div
                    key={s.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 14px",
                      borderRadius: 8,
                      background: "var(--muted)",
                    }}
                  >
                    <span style={{ fontSize: 18 }}>{info.emoji}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{info.label}</div>
                      <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                        {s.status === "uploading" && "Subiendo..."}
                        {s.status === "pending" && "En cola..."}
                        {s.status === "scheduled" && `Programado ✓`}
                        {s.status === "published" && "Publicado ✓"}
                        {s.status === "failed" && `Error: ${s.error}`}
                      </div>
                    </div>
                    <span style={{ fontSize: 16 }}>
                      {s.status === "uploading" || s.status === "pending" ? "⏳" : ""}
                      {s.status === "scheduled" || s.status === "published" ? "✅" : ""}
                      {s.status === "failed" ? "❌" : ""}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Done */}
        {done && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--foreground)" }}>
              ✅ Listo
            </div>
            {uploadStatuses.map((s) => {
              const info = PLATFORM_INFO[s.platform] ?? { label: s.platform, emoji: "🌐", color: "#666" };
              return (
                <div
                  key={s.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 14px",
                    borderRadius: 8,
                    background: s.status === "failed" ? "rgba(220,50,50,0.1)" : "rgba(50,200,100,0.1)",
                    border: `1px solid ${s.status === "failed" ? "rgba(220,50,50,0.3)" : "rgba(50,200,100,0.3)"}`,
                  }}
                >
                  <span style={{ fontSize: 18 }}>{info.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{info.label}</div>
                    <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                      {s.status === "scheduled" && "Programado correctamente"}
                      {s.status === "published" && (s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>Ver publicación →</a> : "Publicado")}
                      {s.status === "failed" && `Error: ${s.error ?? "desconocido"}`}
                    </div>
                  </div>
                </div>
              );
            })}
            <button
              onClick={onClose}
              style={{
                marginTop: 4,
                padding: "10px 22px",
                borderRadius: 8,
                border: "none",
                background: "var(--accent)",
                color: "#fff",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 700,
                alignSelf: "flex-end",
              }}
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
