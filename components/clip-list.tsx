"use client";

import { useState, useEffect } from "react";
import type { Clip } from "@/lib/db";
import PublishDialog from "./publish-dialog";

interface ClipListProps {
  projectId: string;
  initialClips: Clip[];
  isReady: boolean;
  onSelectClip?: (clip: Clip) => void;
  selectedClipId?: string | null;
  captionsJson?: string | null;
}

export default function ClipList({ projectId, initialClips, isReady, onSelectClip, selectedClipId, captionsJson }: ClipListProps) {
  const [clips, setClips] = useState<Clip[]>(initialClips);
  const [pollStartTime] = useState(() => Date.now());
  const [publishingClip, setPublishingClip] = useState<Clip | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [copiedClipId, setCopiedClipId] = useState<string | null>(null);

  // Sync when parent refreshes clips (e.g. after pipeline completes)
  useEffect(() => {
    if (initialClips.length > 0) {
      setClips(initialClips);
    }
  }, [initialClips]);
  const POLL_TIMEOUT_MS = 120_000; // stop polling after 2 minutes

  // Poll until all clips have output_path (cut progressively during pipeline)
  useEffect(() => {
    const allCut = clips.length > 0 && clips.every((c) => c.output_path);
    if (allCut || !isReady) return;

    const interval = setInterval(async () => {
      // Stop polling after timeout
      if (Date.now() - pollStartTime > POLL_TIMEOUT_MS) {
        clearInterval(interval);
        return;
      }
      const res = await fetch(`/api/projects/${projectId}/clips`);
      if (!res.ok) return;
      const updated: Clip[] = await res.json();
      setClips(updated);
      if (updated.length > 0 && updated.every((c) => c.output_path)) {
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [projectId, clips, isReady, pollStartTime]);

  const handleApproval = async (clipId: string, status: "approved" | "rejected" | "pending") => {
    setApprovingId(clipId);
    try {
      const res = await fetch(`/api/clips/${clipId}/approve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setClips((prev) =>
          prev.map((c) => (c.id === clipId ? { ...c, approval_status: status } : c))
        );
      }
    } catch {
      // ignore
    }
    setApprovingId(null);
  };

  const handleBulkApprove = async () => {
    const pending = clips.filter((c) => c.approval_status !== "approved" && c.approval_status !== "rejected");
    for (const clip of pending) {
      await handleApproval(clip.id, "approved");
    }
  };

  if (!isReady) {
    return (
      <div style={{ color: "var(--muted-foreground)", fontSize: 13, textAlign: "center", padding: "12px 0" }}>
        Procesá el video para ver los clips.
      </div>
    );
  }

  if (clips.length === 0) {
    return (
      <div style={{ color: "var(--muted-foreground)", fontSize: 13, textAlign: "center", padding: "12px 0" }}>
        No se encontraron segmentos suficientemente largos.
      </div>
    );
  }

  const hasAiClips = clips.some((c) => c.hook_phrase);
  const approvedCount = clips.filter((c) => c.approval_status === "approved").length;
  const rejectedCount = clips.filter((c) => c.approval_status === "rejected").length;
  const pendingCount = clips.filter((c) => !c.approval_status || c.approval_status === "pending").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
        <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
          {clips.length} clips · {hasAiClips ? "ordenados por score" : "por pausa"}
        </div>
        {hasAiClips && (
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "#6366f1",
              background: "rgba(99,102,241,0.12)",
              border: "1px solid rgba(99,102,241,0.25)",
              borderRadius: 20,
              padding: "2px 8px",
              letterSpacing: "0.03em",
            }}
          >
            ✦ Recortado con IA
          </div>
        )}
      </div>

      {/* Approval summary + bulk actions */}
      {clips.length > 0 && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "var(--muted)", borderRadius: 8, padding: "6px 10px", marginBottom: 4,
        }}>
          <div style={{ display: "flex", gap: 10, fontSize: 11 }}>
            {approvedCount > 0 && <span style={{ color: "#22c55e" }}>✅ {approvedCount}</span>}
            {rejectedCount > 0 && <span style={{ color: "#ef4444" }}>❌ {rejectedCount}</span>}
            {pendingCount > 0 && <span style={{ color: "#f59e0b" }}>⏳ {pendingCount}</span>}
          </div>
          {pendingCount > 0 && (
            <button
              onClick={handleBulkApprove}
              style={{
                background: "transparent", border: "1px solid rgba(34,197,94,0.3)",
                color: "#22c55e", borderRadius: 6, padding: "3px 8px",
                fontSize: 10, fontWeight: 600, cursor: "pointer",
              }}
            >
              Aprobar todos
            </button>
          )}
        </div>
      )}

      {clips.map((clip, idx) => {
        const durationSec = Math.round(clip.end_seconds - clip.start_seconds);
        const isCut = !!clip.output_path;
        const hookText = clip.hook_phrase ?? clip.name ?? `Clip ${idx + 1}`;
        const reasonText = clip.ai_reasoning;
        const status = clip.approval_status || "pending";
        const isRejected = status === "rejected";

        return (
          <div
            key={clip.id}
            onClick={() => onSelectClip?.(clip)}
            style={{
              background: selectedClipId === clip.id
                ? "rgba(99,102,241,0.08)"
                : isRejected
                ? "rgba(239,68,68,0.04)"
                : "var(--muted)",
              borderRadius: 10,
              border: `1px solid ${
                selectedClipId === clip.id
                  ? "var(--accent)"
                  : isRejected
                  ? "rgba(239,68,68,0.2)"
                  : "var(--border)"
              }`,
              overflow: "hidden",
              cursor: onSelectClip ? "pointer" : "default",
              transition: "border-color 0.15s, background 0.15s",
              opacity: isRejected ? 0.5 : 1,
            }}
          >
            {/* Main row */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "10px 12px",
              }}
            >
              {/* Index badge */}
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  background: getIndexColor(idx),
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 800,
                  color: "#fff",
                  flexShrink: 0,
                  marginTop: 1,
                }}
              >
                {idx + 1}
              </div>

              {/* Hook + time */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Hook phrase */}
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    lineHeight: 1.4,
                    marginBottom: 2,
                    // truncate to 2 lines
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {clip.hook_phrase ? `"${hookText}"` : hookText}
                </div>

                {/* Time range */}
                <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                  {formatTime(clip.start_seconds)} → {formatTime(clip.end_seconds)} · {durationSec}s
                </div>
              </div>

              {/* Score badge */}
              {clip.ai_score !== null && (
                <div style={{
                  flexShrink: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 2,
                }}>
                  <div style={{
                    fontSize: 15,
                    fontWeight: 800,
                    color: getScoreColor(clip.ai_score),
                    lineHeight: 1,
                  }}>
                    {clip.ai_score}
                  </div>
                  <div style={{ fontSize: 9, color: "var(--muted-foreground)", letterSpacing: 0.3 }}>
                    SCORE
                  </div>
                </div>
              )}

              {/* Actions column */}
              <div style={{ flexShrink: 0, paddingTop: 2, display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end" }}>
                {isCut ? (
                  <>
                    {/* Approval buttons */}
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleApproval(clip.id, status === "approved" ? "pending" : "approved"); }}
                        disabled={approvingId === clip.id}
                        title={status === "approved" ? "Desaprobar" : "Aprobar"}
                        style={{
                          width: 26, height: 26, borderRadius: 6, border: "none",
                          background: status === "approved" ? "rgba(34,197,94,0.15)" : "var(--card)",
                          color: status === "approved" ? "#22c55e" : "var(--muted-foreground)",
                          cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center",
                          outline: status === "approved" ? "1px solid rgba(34,197,94,0.3)" : "1px solid var(--border)",
                        }}
                      >
                        ✓
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleApproval(clip.id, status === "rejected" ? "pending" : "rejected"); }}
                        disabled={approvingId === clip.id}
                        title={status === "rejected" ? "Restaurar" : "Descartar"}
                        style={{
                          width: 26, height: 26, borderRadius: 6, border: "none",
                          background: status === "rejected" ? "rgba(239,68,68,0.15)" : "var(--card)",
                          color: status === "rejected" ? "#ef4444" : "var(--muted-foreground)",
                          cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center",
                          outline: status === "rejected" ? "1px solid rgba(239,68,68,0.3)" : "1px solid var(--border)",
                        }}
                      >
                        ✕
                      </button>
                    </div>

                    {/* Play + Copy + Download */}
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); onSelectClip?.(clip); }}
                        title="Ver en panel derecho"
                        style={{
                          width: 26, height: 26, borderRadius: 6, border: "none",
                          background: selectedClipId === clip.id ? "rgba(99,102,241,0.15)" : "var(--card)",
                          color: selectedClipId === clip.id ? "#6366f1" : "var(--muted-foreground)",
                          cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center",
                          outline: selectedClipId === clip.id ? "1px solid rgba(99,102,241,0.3)" : "1px solid var(--border)",
                        }}
                      >
                        ▶
                      </button>
                      {captionsJson && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const text = getClipTranscript(captionsJson, clip.start_seconds, clip.end_seconds);
                            const caption = clip.hook_phrase ? `${clip.hook_phrase}\n\n${text}` : text;
                            navigator.clipboard.writeText(caption).then(() => {
                              setCopiedClipId(clip.id);
                              setTimeout(() => setCopiedClipId(null), 2000);
                            });
                          }}
                          title="Copiar caption"
                          style={{
                            width: 26, height: 26, borderRadius: 6, border: "none",
                            background: copiedClipId === clip.id ? "rgba(34,197,94,0.15)" : "var(--card)",
                            color: copiedClipId === clip.id ? "#22c55e" : "var(--muted-foreground)",
                            cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center",
                            outline: copiedClipId === clip.id ? "1px solid rgba(34,197,94,0.3)" : "1px solid var(--border)",
                          }}
                        >
                          {copiedClipId === clip.id ? "✓" : "📋"}
                        </button>
                      )}
                    </div>
                    <a
                      href={`/api/${clip.output_path}`}
                      download
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        background: "var(--accent)",
                        color: "#fff",
                        borderRadius: 6,
                        padding: "4px 10px",
                        fontSize: 12,
                        fontWeight: 600,
                        textDecoration: "none",
                        whiteSpace: "nowrap",
                      }}
                    >
                      ↓ Descargar
                    </a>
                    {status === "approved" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setPublishingClip(clip); }}
                        style={{
                          background: "transparent",
                          border: "1px solid var(--border)",
                          color: "var(--foreground)",
                          borderRadius: 6,
                          padding: "4px 10px",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        📤 Publicar
                      </button>
                    )}
                    {status === "pending" && (
                      <div style={{ fontSize: 10, color: "#f59e0b", fontStyle: "italic" }}>
                        Aprobá para publicar
                      </div>
                    )}
                  </>

                ) : Date.now() - pollStartTime > POLL_TIMEOUT_MS ? (
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--destructive)",
                    }}
                  >
                    Error al cortar
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--muted-foreground)",
                      fontStyle: "italic",
                    }}
                  >
                    Cortando...
                  </div>
                )}
              </div>
            </div>

            {/* AI reason (if present) */}
            {reasonText && (
              <div
                style={{
                  padding: "0 12px 10px 48px",
                  fontSize: 11,
                  color: "var(--muted-foreground)",
                  fontStyle: "italic",
                  lineHeight: 1.5,
                  borderTop: "1px solid var(--border)",
                  paddingTop: 8,
                  marginTop: 0,
                }}
              >
                💡 {reasonText}
              </div>
            )}

          </div>
        );
      })}

      {/* Publish dialog */}
      {publishingClip && (
        <PublishDialog
          filePath={publishingClip.output_path!}
          clipId={publishingClip.id}
          defaultCaption={publishingClip.name ?? publishingClip.hook_phrase ?? ""}
          onClose={() => setPublishingClip(null)}
        />
      )}
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getIndexColor(idx: number): string {
  const colors = ["#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe"];
  return colors[Math.min(idx, colors.length - 1)];
}

function getScoreColor(score: number): string {
  if (score >= 80) return "#22c55e"; // green
  if (score >= 60) return "#f59e0b"; // amber
  if (score >= 40) return "#f97316"; // orange
  return "#ef4444";                  // red
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Extract the transcript text for a clip's time range from the captions JSON.
 * Captions are stored as an array of { text, startMs, endMs } tokens.
 */
function getClipTranscript(captionsJson: string, startSec: number, endSec: number): string {
  try {
    const captions: { text: string; startMs: number; endMs: number }[] = JSON.parse(captionsJson);
    const startMs = startSec * 1000;
    const endMs = endSec * 1000;
    return captions
      .filter((c) => c.startMs >= startMs && c.endMs <= endMs)
      .map((c) => c.text)
      .join("")
      .trim();
  } catch {
    return "";
  }
}
