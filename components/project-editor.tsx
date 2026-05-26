"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Project, Render, Clip } from "@/lib/db";
import PipelineProgress from "./pipeline-progress";
import ClipList from "./clip-list";
import dynamic from "next/dynamic";

const RightPanel = dynamic(() => import("./right-panel"), { ssr: false });

interface ProjectEditorProps {
  project: Project;
  renders: Render[];
  clips?: Clip[];
}

export default function ProjectEditor({ project: initialProject, renders: initialRenders, clips: initialClips = [] }: ProjectEditorProps) {
  const router = useRouter();
  const [project, setProject] = useState(initialProject);
  const [renders, setRenders] = useState(initialRenders);
  const [clips, setClips] = useState(initialClips);
  const [deletingProject, setDeletingProject] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isClipsMode = project.mode === "clips";
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [pipelineDone, setPipelineDone] = useState(
    !!initialProject.captions && !!initialProject.silence_data
  );
  const [captionPreset, setCaptionPreset] = useState(initialProject.caption_preset || "bold");
  const [selectedClip, setSelectedClip] = useState<Clip | null>(null);
  const [jobProgress, setJobProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [jobStep, setJobStep] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshProject = useCallback(async () => {
    const res = await fetch(`/api/projects/${project.id}`);
    const updated = await res.json();
    setProject(updated);
  }, [project.id]);

  async function handleDeleteProject() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    setDeletingProject(true);
    await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    router.push("/");
  }

  async function uploadVideo(file: File) {
    setUploading(true);
    setUploadError(null);

    try {
      // Step 1: Ask server for an upload URL (Supabase signed URL in prod, direct in local)
      const urlRes = await fetch("/api/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, filename: file.name }),
      });
      if (!urlRes.ok) {
        const err = await urlRes.json().catch(() => ({}));
        throw new Error(err.error || `Error ${urlRes.status} al obtener URL de upload`);
      }
      const urlData = await urlRes.json();

      if (urlData.mode === "supabase") {
        // Step 2a: Upload directly to Supabase Storage (bypasses Railway proxy entirely)
        const uploadRes = await fetch(urlData.signedUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type || "video/mp4" },
        });
        if (!uploadRes.ok) {
          throw new Error(`Error ${uploadRes.status} al subir a Supabase Storage`);
        }

        // Step 3a: Notify server that upload is complete
        const completeRes = await fetch("/api/upload-complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: project.id, storagePath: urlData.storagePath }),
        });
        if (!completeRes.ok) throw new Error("Error al registrar el video");
        const updated = await completeRes.json();
        setProject(updated);

      } else {
        // Step 2b: Local dev — use the legacy direct upload endpoint
        const formData = new FormData();
        formData.append("file", file);
        formData.append("projectId", project.id);
        const res = await fetch("/api/upload-video", { method: "POST", body: formData });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Error ${res.status}`);
        }
        await refreshProject();
      }
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Error de red al subir el video");
    } finally {
      setUploading(false);
    }
  }

  async function runPipeline() {
    const res = await fetch("/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id }),
    });
    const { jobId: id } = await res.json();
    setJobId(id);
    await refreshProject();
  }

  async function triggerRender(platform: string) {
    const res = await fetch("/api/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id, platform, captionPreset }),
    });
    const render = await res.json();
    setRenders((prev) => [render, ...prev]);
    // Poll renders
    pollRender(render.id);
  }

  async function pollRender(renderId: string) {
    const interval = setInterval(async () => {
      const res = await fetch(`/api/render/${renderId}`);
      const r = await res.json();
      setRenders((prev) => prev.map((rr) => (rr.id === renderId ? r : rr)));
      if (r.status === "complete" || r.status === "failed") {
        clearInterval(interval);
      }
    }, 1500);
  }

  async function onPipelineComplete() {
    setPipelineDone(true);
    setJobId(null);
    await refreshProject();
    // Reload clips for multi-clip mode
    if (isClipsMode) {
      const res = await fetch(`/api/projects/${project.id}/clips`);
      if (res.ok) setClips(await res.json());
    }
  }

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("video/")) {
        uploadVideo(file);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project.id]
  );

  const CAPTION_PRESETS = ["bold", "classic", "outline", "glow", "box"] as const;
  const PLATFORMS = [
    { id: "tiktok", label: "TikTok", icon: "🎵" },
    { id: "youtube_short", label: "YouTube Shorts", icon: "▶️" },
    { id: "instagram_reel", label: "Instagram Reel", icon: "📸" },
  ];

  const hasVideo = !!project.source_video;
  const isProcessing = project.status === "processing" || !!jobId;
  const isReady = project.status === "ready" || pipelineDone;

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Left panel: controls */}
      <div
        style={{
          width: 360,
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          overflow: "auto",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Link href="/" style={{ color: "var(--muted-foreground)", textDecoration: "none", fontSize: 18 }}>
            ←
          </Link>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{project.name}</div>
            <StatusBadge status={project.status} />
          </div>
          <button
            onClick={handleDeleteProject}
            disabled={deletingProject}
            title={confirmDelete ? "Hacer click de nuevo para confirmar eliminación" : "Eliminar proyecto y todos sus archivos"}
            style={{
              background: confirmDelete ? "var(--destructive, #e53e3e)" : "transparent",
              border: confirmDelete ? "1px solid var(--destructive, #e53e3e)" : "1px solid var(--border)",
              borderRadius: 8,
              padding: "4px 10px",
              fontSize: 13,
              cursor: deletingProject ? "not-allowed" : "pointer",
              color: confirmDelete ? "#fff" : "var(--muted-foreground)",
              display: "flex",
              alignItems: "center",
              gap: 4,
              transition: "all 0.2s",
              opacity: deletingProject ? 0.5 : 1,
              whiteSpace: "nowrap",
            }}
          >
            {deletingProject ? "Eliminando…" : confirmDelete ? "✓ Confirmar" : "🗑 Eliminar"}
          </button>
        </div>

        <div style={{ padding: 24, flex: 1 }}>
          {/* Step 1: Upload */}
          <StepSection
            number={1}
            title="Subir video"
            done={hasVideo}
          >
            {uploadError && (
              <div style={{ color: "red", fontSize: 13, marginBottom: 8, padding: "8px 12px", background: "rgba(255,0,0,0.08)", borderRadius: 6 }}>
                ⚠️ {uploadError}
              </div>
            )}
            {!hasVideo ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${isDragging ? "var(--accent)" : "var(--border)"}`,
                  borderRadius: 10,
                  padding: "24px 16px",
                  textAlign: "center",
                  cursor: "pointer",
                  background: isDragging ? "rgba(99,102,241,0.05)" : "transparent",
                  transition: "all 0.15s",
                }}
              >
                <div style={{ fontSize: 32, marginBottom: 8 }}>🎬</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                  {uploading ? "Subiendo..." : "Arrastrá tu video aquí"}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                  o hacé click para seleccionar
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadVideo(file);
                  }}
                />
              </div>
            ) : (
              <div
                style={{
                  background: "var(--muted)",
                  borderRadius: 8,
                  padding: "10px 14px",
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span>🎬 {project.source_video?.split("/").pop()}</span>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--muted-foreground)",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  Cambiar
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadVideo(file);
                  }}
                />
              </div>
            )}
          </StepSection>

          {/* Step 2: Pipeline */}
          <StepSection
            number={2}
            title="Procesar"
            done={isReady}
            disabled={!hasVideo}
          >
            {/* Orientation hint for multi-clip mode */}
            {isClipsMode && hasVideo && !isProcessing && !isReady && (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--muted-foreground)",
                  background: "var(--muted)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: "6px 10px",
                  marginBottom: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span>📐</span>
                <span>Si el video es horizontal, se re-encuadrará a vertical (9:16) centrado automáticamente.</span>
              </div>
            )}
            {isProcessing && jobId ? (
              <PipelineProgress
                jobId={jobId}
                mode={project.mode}
                onComplete={onPipelineComplete}
                onProgress={(p, s) => { setJobProgress(p); setJobStep(s); }}
              />
            ) : isReady ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <SuccessRow label="Transcripción" value={project.captions ? "✓ Lista" : "—"} />
                <SuccessRow label="Silencios detectados" value={project.silence_data ? "✓ Listo" : "—"} />
                {project.duration_seconds && (
                  <SuccessRow
                    label="Duración"
                    value={`${Math.round(project.duration_seconds)}s`}
                  />
                )}
                <button
                  onClick={runPipeline}
                  style={{
                    marginTop: 4,
                    background: "none",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "6px 10px",
                    fontSize: 12,
                    color: "var(--muted-foreground)",
                    cursor: "pointer",
                  }}
                >
                  Re-procesar
                </button>
              </div>
            ) : (
              <button
                onClick={runPipeline}
                disabled={!hasVideo}
                style={{
                  width: "100%",
                  background: hasVideo ? "var(--accent)" : "var(--muted)",
                  border: "none",
                  borderRadius: 8,
                  padding: "10px",
                  fontSize: 14,
                  fontWeight: 600,
                  color: hasVideo ? "#fff" : "var(--muted-foreground)",
                  cursor: hasVideo ? "pointer" : "not-allowed",
                }}
              >
                Procesar video
              </button>
            )}
          </StepSection>

          {/* Steps 3 & 4: differ by mode */}
          {isClipsMode ? (
            /* CLIPS MODE: show ranked clip list */
            <StepSection
              number={3}
              title="Clips clasificados por IA"
              done={clips.length > 0 && clips.every((c) => c.ai_score !== null)}
              disabled={!isReady}
            >
              <ClipList
                projectId={project.id}
                initialClips={clips}
                isReady={isReady}
                onSelectClip={setSelectedClip}
                selectedClipId={selectedClip?.id ?? null}
              />
            </StepSection>
          ) : (
            <>
              {/* SINGLE MODE: style + render */}
              <StepSection
                number={3}
                title="Estilo de subtítulos"
                done={false}
                disabled={!isReady}
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {CAPTION_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => setCaptionPreset(preset)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 6,
                        border: `1px solid ${captionPreset === preset ? "var(--accent)" : "var(--border)"}`,
                        background: captionPreset === preset ? "rgba(99,102,241,0.15)" : "var(--muted)",
                        color: captionPreset === preset ? "var(--accent)" : "var(--foreground)",
                        fontSize: 13,
                        cursor: "pointer",
                        fontWeight: captionPreset === preset ? 600 : 400,
                      }}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </StepSection>

              <StepSection
                number={4}
                title="Renderizar"
                done={renders.some((r) => r.status === "complete")}
                disabled={!isReady}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {PLATFORMS.map((p) => {
                    const existing = renders.find((r) => r.platform === p.id);
                    return (
                      <div
                        key={p.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          background: "var(--muted)",
                          borderRadius: 8,
                          padding: "10px 12px",
                        }}
                      >
                        <div style={{ fontSize: 13 }}>
                          {p.icon} {p.label}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {existing && <RenderStatus render={existing} />}
                          <button
                            onClick={() => triggerRender(p.id)}
                            disabled={!isReady || existing?.status === "rendering"}
                            style={{
                              background: isReady ? "var(--accent)" : "transparent",
                              border: isReady ? "none" : "1px solid var(--border)",
                              borderRadius: 6,
                              padding: "4px 10px",
                              fontSize: 12,
                              color: isReady ? "#fff" : "var(--muted-foreground)",
                              cursor: isReady ? "pointer" : "not-allowed",
                              fontWeight: 600,
                            }}
                          >
                            {existing?.status === "rendering" ? "..." : "Render"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </StepSection>
            </>
          )}
        </div>
      </div>

      {/* Right panel: contextual */}
      <RightPanel
        project={project}
        captionPreset={captionPreset}
        jobId={jobId}
        jobProgress={jobProgress}
        jobStep={jobStep}
        selectedClip={selectedClip}
        isReady={isReady}
      />
    </div>
  );
}

// Sub-components

function StepSection({
  number,
  title,
  done,
  disabled,
  children,
}: {
  number: number;
  title: string;
  done: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        marginBottom: 24,
        opacity: disabled ? 0.4 : 1,
        pointerEvents: disabled ? "none" : "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: done ? "var(--success)" : "var(--muted)",
            border: `1px solid ${done ? "var(--success)" : "var(--border)"}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 700,
            flexShrink: 0,
            color: done ? "#000" : "var(--muted-foreground)",
          }}
        >
          {done ? "✓" : number}
        </div>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
      </div>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    draft: { label: "Borrador", color: "var(--muted-foreground)" },
    processing: { label: "Procesando", color: "var(--warning)" },
    ready: { label: "Listo", color: "var(--success)" },
    rendering: { label: "Renderizando", color: "var(--accent)" },
    rendered: { label: "Renderizado", color: "var(--success)" },
  };
  const s = map[status] || { label: status, color: "var(--muted-foreground)" };
  return (
    <div style={{ fontSize: 12, color: s.color, display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.color, display: "inline-block" }} />
      {s.label}
    </div>
  );
}

function SuccessRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: 13,
        padding: "4px 0",
      }}
    >
      <span style={{ color: "var(--muted-foreground)" }}>{label}</span>
      <span style={{ color: "var(--success)", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function RenderStatus({ render }: { render: Render }) {
  if (render.status === "rendering" || render.status === "queued") {
    const label = render.status === "queued"
      ? "En cola..."
      : render.progress >= 95
      ? "Codificando..."
      : `${Math.round(render.progress)}%`;
    return (
      <span style={{ fontSize: 12, color: "var(--accent)" }}>{label}</span>
    );
  }
  if (render.status === "complete") {
    return (
      <a
        href={`/${render.output_path}`}
        download
        style={{ fontSize: 12, color: "var(--success)", textDecoration: "none", fontWeight: 600 }}
      >
        ↓ Descargar
      </a>
    );
  }
  if (render.status === "failed") {
    return (
      <span style={{ fontSize: 12, color: "var(--destructive)" }} title={render.error ?? ""}>
        ✕ Error
      </span>
    );
  }
  return null;
}
