"use client";

import { useMemo, useRef, useEffect } from "react";

interface Token {
  text: string;
  startMs: number;
  endMs: number;
}

interface TranscriptViewerProps {
  captionsJson: string;
  currentTimeMs?: number;
  onSeek?: (ms: number) => void;
}

export default function TranscriptViewer({
  captionsJson,
  currentTimeMs = 0,
  onSeek,
}: TranscriptViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const tokens = useMemo<Token[]>(() => {
    try {
      return JSON.parse(captionsJson);
    } catch {
      return [];
    }
  }, [captionsJson]);

  // Group tokens into sentences (~12 words each) for readability
  const sentences = useMemo(() => {
    const result: { tokens: Token[]; startMs: number; endMs: number }[] = [];
    const WORDS_PER_GROUP = 12;
    for (let i = 0; i < tokens.length; i += WORDS_PER_GROUP) {
      const group = tokens.slice(i, i + WORDS_PER_GROUP);
      result.push({
        tokens: group,
        startMs: group[0].startMs,
        endMs: group[group.length - 1].endMs,
      });
    }
    return result;
  }, [tokens]);

  // Auto-scroll to active sentence
  const activeIdx = useMemo(() => {
    for (let i = sentences.length - 1; i >= 0; i--) {
      if (currentTimeMs >= sentences[i].startMs) return i;
    }
    return -1;
  }, [sentences, currentTimeMs]);

  useEffect(() => {
    if (activeIdx < 0 || !containerRef.current) return;
    const el = containerRef.current.querySelector(`[data-sentence="${activeIdx}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeIdx]);

  if (tokens.length === 0) {
    return (
      <div style={{ padding: 16, color: "var(--muted-foreground)", fontSize: 13, textAlign: "center" }}>
        Sin transcripcion disponible
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        maxHeight: 220,
        overflow: "auto",
        padding: "8px 12px",
        fontSize: 13,
        lineHeight: 1.7,
      }}
    >
      {sentences.map((sentence, sIdx) => {
        const isActive = sIdx === activeIdx;
        return (
          <div
            key={sIdx}
            data-sentence={sIdx}
            style={{
              padding: "4px 8px",
              borderRadius: 6,
              marginBottom: 2,
              background: isActive ? "rgba(99,102,241,0.08)" : "transparent",
              transition: "background 0.2s",
              cursor: onSeek ? "pointer" : "default",
            }}
            onClick={() => onSeek?.(sentence.startMs)}
          >
            <span
              style={{
                fontSize: 10,
                color: "var(--muted-foreground)",
                marginRight: 8,
                fontFamily: "monospace",
                opacity: 0.7,
              }}
            >
              {formatMs(sentence.startMs)}
            </span>
            {sentence.tokens.map((token, tIdx) => {
              const isWordActive =
                currentTimeMs >= token.startMs && currentTimeMs < token.endMs;
              return (
                <span
                  key={tIdx}
                  style={{
                    color: isWordActive
                      ? "var(--accent)"
                      : isActive
                      ? "var(--foreground)"
                      : "var(--muted-foreground)",
                    fontWeight: isWordActive ? 700 : 400,
                    transition: "color 0.15s",
                  }}
                >
                  {token.text}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}
