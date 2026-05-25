import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";

/** Read ANTHROPIC_API_KEY from process.env or directly from .env.local as fallback */
function resolveApiKey(): string | undefined {
  if (process.env.ANTHROPIC_API_KEY?.trim()) return process.env.ANTHROPIC_API_KEY.trim();
  try {
    const envFile = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf-8");
    const match = envFile.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    return match?.[1]?.trim() || undefined;
  } catch {
    return undefined;
  }
}

function getClient(): Anthropic {
  const apiKey = resolveApiKey();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not found in env or .env.local");
  return new Anthropic({ apiKey });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type Token = {
  text: string;
  startMs: number;
  endMs: number;
};

export type SmartClip = {
  start_ms: number;
  end_ms: number;
  hook: string;   // frase de inicio del clip
  reason: string; // por qué es un buen gancho
  score: number;  // 0-100 potencial viral
};

// ─── Transcript formatter ─────────────────────────────────────────────────────

/**
 * Groups word tokens into readable "phrase lines" with their startMs as label.
 * Claude receives these labels and must return them verbatim as timestamps.
 *
 * Format: "[<startMs>] <phrase text>"
 * Example: "[130] Si aumentaste de peso después de atravesar un duelo,"
 */
function buildLabeledTranscript(tokens: Token[]): {
  lines: string[];
  startMsValues: number[];
} {
  const lines: string[] = [];
  const startMsValues: number[] = [];
  let group: Token[] = [];

  const flush = () => {
    if (group.length === 0) return;
    const ms = group[0].startMs;
    const text = group.map((t) => t.text).join("").trim();
    if (text) {
      lines.push(`[${ms}] ${text}`);
      startMsValues.push(ms);
    }
    group = [];
  };

  for (const token of tokens) {
    group.push(token);
    const hasPunct = /[.!?]/.test(token.text); // sentence-ending punctuation
    const isLong = group.length >= 18;
    if (hasPunct || isLong) flush();
  }
  flush();

  return { lines, startMsValues };
}

// ─── Timestamp snapping ───────────────────────────────────────────────────────

/**
 * Given a ms value returned by Claude, find the nearest real token boundary.
 * preferStart=true → snap to token.startMs, false → token.endMs
 */
function snapToToken(targetMs: number, tokens: Token[], preferStart: boolean): number {
  let best = tokens[0];
  let bestDiff = Infinity;

  for (const t of tokens) {
    const ts = preferStart ? t.startMs : t.endMs;
    const diff = Math.abs(ts - targetMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = t;
    }
  }

  return preferStart ? best.startMs : best.endMs;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Uses Claude to identify the best clip moments in a transcript.
 * Returns clips with start/end snapped to real token boundaries.
 *
 * Falls back gracefully: if Claude's response can't be parsed, returns empty
 * array so the caller can fall back to pause-based segmentation.
 */
export async function smartClipVideo(tokens: Token[]): Promise<SmartClip[]> {
  if (tokens.length === 0) return [];

  const { lines, startMsValues } = buildLabeledTranscript(tokens);
  const totalSec = Math.round(tokens[tokens.length - 1].endMs / 1000);
  const transcript = lines.join("\n");

  // Build a compact list of valid start timestamps for the prompt
  const validStarts = startMsValues.join(", ");

  const prompt = `Sos un editor experto en contenido viral para TikTok, Instagram Reels y YouTube Shorts.

Analizás la transcripción de un video de ${totalSec}s en español. Cada línea empieza con [ms] — el timestamp en milisegundos del inicio de esa frase.

MISIÓN: identificar los mejores momentos para hacer clips virales.

REGLAS:
• El inicio DEBE ser un gancho fuerte: pregunta directa, dato sorprendente, declaración emocional, promesa de valor, o inicio de historia que genera curiosidad
• El final debe cerrar la idea — nunca cortar a mitad de oración
• Duración ideal: 20-60 segundos por clip
• Encontrá entre 3 y 8 clips — el mínimo es 3, más clips = mejor resultado para el usuario
• Los clips NO se deben solapar: el start_ms de cada clip debe ser mayor al end_ms del anterior
• start_ms y end_ms DEBEN ser valores exactos de esta lista: ${validStarts}

TRANSCRIPCIÓN:
${transcript}

Respondé ÚNICAMENTE con un JSON array válido (sin markdown, sin texto adicional):
[{"start_ms":<número>,"end_ms":<número>,"hook":"<frase exacta de inicio>","reason":"<por qué es un buen gancho, una oración en español>","score":<número entero 0-100 de potencial viral>}]`;

  let raw = "";
  try {
    const response = await getClient().messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    });

    const block = response.content[0];
    if (block.type !== "text") throw new Error("Unexpected response type");

    raw = block.text.trim().replace(/^```json?\n?/, "").replace(/\n?```$/, "");
    const parsed: SmartClip[] = JSON.parse(raw);

    // Validate and snap timestamps to real token boundaries
    const snapped = parsed
      .filter((c) => typeof c.start_ms === "number" && typeof c.end_ms === "number")
      .map((clip, i) => ({
        start_ms: snapToToken(clip.start_ms, tokens, true),
        end_ms:   snapToToken(clip.end_ms,   tokens, false),
        hook:     clip.hook   ?? `Clip ${i + 1}`,
        reason:   clip.reason ?? "",
        score:    Math.max(0, Math.min(100, Number(clip.score) || 0)),
      }))
      .filter((c) => c.end_ms - c.start_ms >= 8_000); // at least 8s

    // Remove overlapping clips — keep the one with the earlier start
    const nonOverlapping: SmartClip[] = [];
    for (const clip of snapped) {
      const prev = nonOverlapping[nonOverlapping.length - 1];
      if (prev && clip.start_ms < prev.end_ms) {
        // Overlap: skip this clip (Claude sometimes produces overlapping ranges)
        continue;
      }
      nonOverlapping.push(clip);
    }

    return nonOverlapping;
  } catch (err) {
    console.warn("[smart-clipper] Failed to parse Claude response:", err);
    console.warn("[smart-clipper] Raw response:", raw.slice(0, 300));
    return []; // caller will fall back to pause-based segmentation
  }
}
