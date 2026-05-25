"use client";

import { useState, useMemo } from "react";
import type { Project, Clip } from "@/lib/db";
import dynamic from "next/dynamic";
import TranscriptViewer from "./transcript-viewer";

const VideoPreview = dynamic(() => import("./video-preview"), { ssr: false });

interface RightPanelProps {
  project: Project;
  captionPreset: string;
  jobId: string | null;
  jobProgress: number;
  jobStep: string;
  selectedClip: Clip | null;
  isReady: boolean;
}

export default function RightPanel({
  project,
  captionPreset,
  jobId,
  jobProgress,
  jobStep,
  selectedClip,
  isReady,
}: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<"subtitulos" | "info">("subtitulos");
  const hasVideo = !!project.source_video;
  const isProcessing = !!jobId;
  const isClipsMode = project.mode === "clips";

  // ── State 1: No video ──────────────────────────────────────────────────────
  if (!hasVideo) {
    return (
      <PanelContainer>
        <div style={{ textAlign: "center", color: "var(--muted-foreground)", maxWidth: 280 }}>
          <div style={{ fontSize: 72, marginBottom: 20, opacity: 0.6 }}>
            <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
              <line x1="7" y1="2" x2="7" y2="22" />
              <line x1="17" y1="2" x2="17" y2="22" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <line x1="2" y1="7" x2="7" y2="7" />
              <line x1="2" y1="17" x2="7" y2="17" />
              <line x1="17" y1="17" x2="22" y2="17" />
              <line x1="17" y1="7" x2="22" y2="7" />
            </svg>
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: "var(--foreground)" }}>
            Arrastra un video para empezar
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>
            Soporta MP4, MOV, WEBM y otros formatos de video
          </div>
        </div>
      </PanelContainer>
    );
  }

  // ── State 2: Processing ────────────────────────────────────────────────────
  if (isProcessing) {
    return (
      <PanelContainer>
        <div style={{ position: "relative", width: "100%", maxWidth: 320 }}>
          {/* Video preview dimmed */}
          <div style={{ opacity: 0.3, filter: "blur(2px)", pointerEvents: "none" }}>
            <video
              src={`/${project.source_video}`}
              style={{
                width: "100%",
                borderRadius: 12,
                aspectRatio: "9/16",
                objectFit: "cover",
                maxHeight: 400,
              }}
            />
          </div>
          {/* Overlay with progress */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
            }}
          >
            <ProgressCircle progress={jobProgress} />
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)", textAlign: "center" }}>
              {jobStep || "Procesando..."}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
              {Math.round(jobProgress)}% completado
            </div>
          </div>
        </div>
      </PanelContainer>
    );
  }

  // ── State 3: Video uploaded but not processed ──────────────────────────────
  if (!isReady) {
    return (
      <PanelContainer>
        <div style={{ width: "100%", maxWidth: 320, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <video
            src={`/${project.source_video}`}
            controls
            style={{
              width: "100%",
              borderRadius: 12,
              aspectRatio: "9/16",
              objectFit: "cover",
              maxHeight: 450,
              border: "2px solid var(--border)",
            }}
          />
          <div
            style={{
              width: "100%",
              background: "var(--card)",
              borderRadius: 10,
              padding: "12px 16px",
              border: "1px solid var(--border)",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: 0.5 }}>
              Video cargado
            </div>
            <div style={{ fontSize: 13, color: "var(--foreground)" }}>
              {project.source_video?.split("/").pop()}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 4 }}>
              Presiona "Procesar video" para continuar
            </div>
          </div>
        </div>
      </PanelContainer>
    );
  }

  // ── State 4: Clips mode — show selected clip ──────────────────────────────
  if (isClipsMode && selectedClip) {
    return (
      <PanelContainer>
        <div style={{ width: "100%", maxWidth: 320, display: "flex", flexDirection: "column", gap: 12 }}>
          {selectedClip.output_path ? (
            <video
              key={selectedClip.id}
              src={`/${selectedClip.output_path}`}
              controls
              style={{
                width: "100%",
                borderRadius: 12,
                aspectRatio: "9/16",
                objectFit: "cover",
                maxHeight: 400,
                border: "2px solid var(--border)",
              }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                aspectRatio: "9/16",
                maxHeight: 400,
                borderRadius: 12,
                border: "2px solid var(--border)",
                background: "var(--card)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--muted-foreground)",
                fontSize: 13,
              }}
            >
              Cortando clip...
            </div>
          )}
          <ClipInfoCard clip={selectedClip} />
        </div>
      </PanelContainer>
    );
  }

  // ── State 5: Ready (single mode or clips without selection) ────────────────
  return (
    <PanelContainer>
      <div style={{ width: "100%", maxWidth: 340, display: "flex", flexDirection: "column", gap: 12 }}>
        <VideoPreview
          videoPath={project.source_video!}
          captionPreset={captionPreset}
          captionsJson={project.captions}
          silenceJson={project.silence_data}
          durationSeconds={project.duration_seconds ?? undefined}
        />
        {/* Tabs below preview */}
        {project.captions && (
          <div
            style={{
              background: "var(--card)",
              borderRadius: 10,
              border: "1px solid var(--border)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <TabButton
                label="Subtitulos"
                active={activeTab === "subtitulos"}
                onClick={() => setActiveTab("subtitulos")}
              />
              <TabButton
                label="Info"
                active={activeTab === "info"}
                onClick={() => setActiveTab("info")}
              />
            </div>
            {activeTab === "subtitulos" ? (
              <TranscriptViewer captionsJson={project.captions} />
            ) : (
              <InfoTab project={project} />
            )}
          </div>
        )}
      </div>
    </PanelContainer>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function PanelContainer({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--muted)",
        padding: "24px 20px",
        overflow: "auto",
      }}
    >
      {children}
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: "8px 12px",
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        color: active ? "var(--accent)" : "var(--muted-foreground)",
        background: "transparent",
        border: "none",
        borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      {label}
    </button>
  );
}

function InfoTab({ project }: { project: Project }) {
  const wordCount = useMemo(() => {
    if (!project.captions) return 0;
    try {
      return JSON.parse(project.captions).length;
    } catch {
      return 0;
    }
  }, [project.captions]);

  const silenceInfo = useMemo(() => {
    if (!project.silence_data) return null;
    try {
      const data = JSON.parse(project.silence_data);
      const silenceCount = data.silenceSegments?.length ?? data.length ?? 0;
      return { count: silenceCount };
    } catch {
      return null;
    }
  }, [project.silence_data]);

  return (
    <div style={{ padding: "12px 16px", fontSize: 13, display: "flex", flexDirection: "column", gap: 8 }}>
      {project.duration_seconds && (
        <InfoRow label="Duracion" value={formatDuration(project.duration_seconds)} />
      )}
      <InfoRow label="Palabras transcritas" value={String(wordCount)} />
      {silenceInfo && (
        <InfoRow label="Silencios detectados" value={String(silenceInfo.count)} />
      )}
      <InfoRow label="Modo" value={project.mode === "clips" ? "Multi-clip" : "Video unico"} />
      <InfoRow
        label="Archivo"
        value={project.source_video?.split("/").pop() ?? "—"}
      />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ color: "var(--muted-foreground)" }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function ClipInfoCard({ clip }: { clip: Clip }) {
  const duration = clip.end_seconds - clip.start_seconds;
  return (
    <div
      style={{
        background: "var(--card)",
        borderRadius: 10,
        border: "1px solid var(--border)",
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {clip.hook_phrase && (
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>
          &ldquo;{clip.hook_phrase}&rdquo;
        </div>
      )}
      <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--muted-foreground)" }}>
        <span>{formatDuration(duration)}</span>
        <span>{clip.start_seconds.toFixed(1)}s → {clip.end_seconds.toFixed(1)}s</span>
        {clip.ai_score !== null && (
          <span style={{ color: "var(--accent)", fontWeight: 600 }}>
            Score: {clip.ai_score}
          </span>
        )}
      </div>
      {clip.ai_reasoning && (
        <div style={{ fontSize: 12, color: "var(--muted-foreground)", fontStyle: "italic", lineHeight: 1.5 }}>
          {clip.ai_reasoning}
        </div>
      )}
      {clip.output_path && (
        <a
          href={`/${clip.output_path}`}
          download
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "var(--success)",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Descargar clip
        </a>
      )}
    </div>
  );
}

function ProgressCircle({ progress }: { progress: number }) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div style={{ position: "relative", width: 100, height: 100 }}>
      <svg width="100" height="100" viewBox="0 0 100 100">
        {/* Background circle */}
        <circle
          cx="50" cy="50" r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth="6"
        />
        {/* Progress arc */}
        <circle
          cx="50" cy="50" r={radius}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
          style={{ transition: "stroke-dashoffset 0.3s ease" }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 20,
          fontWeight: 700,
          color: "var(--foreground)",
        }}
      >
        {Math.round(progress)}%
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  if (min === 0) return `${sec}s`;
  return `${min}m ${sec}s`;
}
