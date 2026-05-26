"use client";

import { useState, useEffect } from "react";
import type { Clip } from "@/lib/db";

interface ClipListProps {
  projectId: string;
  initialClips: Clip[];
  isReady: boolean;
  onSelectClip?: (clip: Clip) => void;
  selectedClipId?: string | null;
}

export default function ClipList({ projectId, initialClips, isReady, onSelectClip, selectedClipId }: ClipListProps) {
  const [clips, setClips] = useState<Clip[]>(initialClips);
  const [pollStartTime] = useState(() => Date.now());

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

      {clips.map((clip, idx) => {
        const durationSec = Math.round(clip.end_seconds - clip.start_seconds);
        const isCut = !!clip.output_path;
        const hookText = clip.hook_phrase ?? clip.name ?? `Clip ${idx + 1}`;
        const reasonText = clip.ai_reasoning;

        return (
          <div
            key={clip.id}
            onClick={() => onSelectClip?.(clip)}
            style={{
              background: selectedClipId === clip.id ? "rgba(99,102,241,0.08)" : "var(--muted)",
              borderRadius: 10,
              border: `1px solid ${selectedClipId === clip.id ? "var(--accent)" : "var(--border)"}`,
              overflow: "hidden",
              cursor: onSelectClip ? "pointer" : "default",
              transition: "border-color 0.15s, background 0.15s",
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

              {/* Download / status */}
              <div style={{ flexShrink: 0, paddingTop: 2 }}>
                {isCut ? (
                  <a
                    href={`/api/${clip.output_path}`}
                    download
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
