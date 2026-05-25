"use client";

import { useEffect, useState } from "react";

interface PipelineProgressProps {
  jobId: string;
  mode?: "single" | "clips";
  onComplete?: () => void;
  onProgress?: (progress: number, step: string) => void;
}

type StepStatus = "pending" | "running" | "done" | "error";

const BASE_STEPS = [
  { key: "Analizando", label: "Analizar video" },
  { key: "Detectando", label: "Detectar silencios" },
  { key: "Cortando", label: "Cortar silencios" },
  { key: "Extrayendo", label: "Extraer audio" },
  { key: "Transcribiendo", label: "Transcribir (Whisper)" },
  { key: "Guardando", label: "Guardar resultados" },
];

const CLIP_STEPS = [
  ...BASE_STEPS,
  { key: "Detectando posición", label: "Detectar rostro" },
  { key: "Reencuadrando", label: "Reencuadrar a vertical" },
  { key: "Analizando contenido", label: "Analizar contenido con IA" },
  { key: "Segmentando", label: "Segmentar clips" },
  { key: "Cortando clip", label: "Cortar clips" },
];

function getStepStatus(
  step: (typeof BASE_STEPS)[0],
  steps: typeof BASE_STEPS,
  currentStep: string | null,
  _progress: number,
  status: string
): StepStatus {
  if (status === "failed") {
    if (currentStep?.toLowerCase().includes(step.key.toLowerCase())) return "error";
  }
  if (status === "complete") return "done";

  if (!currentStep) return "pending";

  const currentIndex = steps.findIndex((s) =>
    currentStep.toLowerCase().includes(s.key.toLowerCase())
  );
  const stepIndex = steps.indexOf(step);

  if (stepIndex < currentIndex) return "done";
  if (stepIndex === currentIndex) return "running";
  return "pending";
}

export default function PipelineProgress({ jobId, mode = "single", onComplete, onProgress }: PipelineProgressProps) {
  const STEPS = mode === "clips" ? CLIP_STEPS : BASE_STEPS;
  const [status, setStatus] = useState("processing");
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const es = new EventSource(`/api/process/${jobId}`);

    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      setStatus(data.status);
      setProgress(data.progress ?? 0);
      setCurrentStep(data.current_step);
      onProgress?.(data.progress ?? 0, data.current_step ?? "");
      if (data.error) setError(data.error);

      if (data.status === "complete") {
        es.close();
        onComplete?.();
      }
      if (data.status === "failed") {
        es.close();
      }
    };

    es.onerror = () => {
      es.close();
    };

    return () => es.close();
  }, [jobId, onComplete]);

  return (
    <div>
      {/* Progress bar */}
      <div
        style={{
          height: 4,
          background: "var(--muted)",
          borderRadius: 2,
          marginBottom: 16,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${progress}%`,
            background: status === "failed" ? "var(--destructive)" : "var(--accent)",
            borderRadius: 2,
            transition: "width 0.3s ease",
          }}
        />
      </div>

      {/* Steps */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {STEPS.map((step) => {
          const stepStatus = getStepStatus(step, STEPS, currentStep, progress, status);
          return (
            <div
              key={step.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 13,
                opacity: stepStatus === "pending" ? 0.4 : 1,
              }}
            >
              <StepIcon status={stepStatus} />
              <span
                style={{
                  color: stepStatus === "running"
                    ? "var(--foreground)"
                    : stepStatus === "done"
                    ? "var(--success)"
                    : stepStatus === "error"
                    ? "var(--destructive)"
                    : "var(--muted-foreground)",
                  fontWeight: stepStatus === "running" ? 600 : 400,
                }}
              >
                {step.label}
              </span>
              {stepStatus === "running" && (
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--accent)",
                    animation: "pulse 1.5s infinite",
                  }}
                >
                  {currentStep}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <div
          style={{
            marginTop: 12,
            padding: "8px 12px",
            background: "rgba(239,68,68,0.1)",
            border: "1px solid var(--destructive)",
            borderRadius: 6,
            fontSize: 12,
            color: "var(--destructive)",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

function StepIcon({ status }: { status: StepStatus }) {
  const size = 18;

  if (status === "done") {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: "var(--success)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          fontWeight: 800,
          flexShrink: 0,
          color: "#000",
        }}
      >
        ✓
      </div>
    );
  }

  if (status === "running") {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          border: "2px solid var(--accent)",
          borderTopColor: "transparent",
          flexShrink: 0,
          animation: "spin 0.8s linear infinite",
        }}
      />
    );
  }

  if (status === "error") {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: "var(--destructive)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          fontWeight: 800,
          flexShrink: 0,
          color: "#fff",
        }}
      >
        ✕
      </div>
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: "1px solid var(--border)",
        flexShrink: 0,
      }}
    />
  );
}
