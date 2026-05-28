import Anthropic from "@anthropic-ai/sdk";
import type { ContentProfile } from "./db";
import { getProfileContext } from "./profile-builder";

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY environment variable not set");
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

// ─── Intro detection ─────────────────────────────────────────────────────────

/**
 * Deterministically detects where the intro zone ends in a transcript.
 *
 * Scans lines in order looking for greeting/presentation patterns.
 * Returns the startMs of the first NON-intro line after two consecutive
 * non-intro lines are found following at least one intro line.
 * Returns 0 if no intro is detected (no filtering needed).
 */
function detectIntroEndMs(tokens: Token[]): number {
  if (tokens.length === 0) return 0;

  const INTRO_REGEXES = [
    /\b(hola|hey)\b/i,
    /\b(muy\s+buen[ao]s?(\s+(días?|tardes?|noches?))?)\b/i,
    /\b(buen[ao]s?\s+(días?|tardes?|noches?))\b/i,
    /\b(bienvenidos?|qué\s+tal|cómo\s+están|como\s+están)\b/i,
    /\b(en\s+el\s+(video|episodio)\s+de\s+hoy|hoy\s+vamos\s+a\s+(ver|hablar|tratar))\b/i,
    /\b(en\s+este\s+(video|episodio|capítulo))\b/i,
    /\b(mi\s+nombre\s+es|me\s+llamo|les?\s+habla)\b/i,
    /\b(antes\s+de\s+empezar|no\s+olvid[eé]n?s?\s+suscrib)\b/i,
    /\b(gracias\s+por\s+(estar|acompañar))\b/i,
    /\b(les?\s+traigo|hoy\s+(les?|te)\s+(traigo|enseño|cuento))\b/i,
  ];

  const isIntroLine = (text: string): boolean =>
    INTRO_REGEXES.some((r) => r.test(text));

  const { lines, startMsValues } = buildLabeledTranscript(tokens);
  const MAX_INTRO_SCAN_MS = 3 * 60 * 1000; // only scan first 3 minutes

  let foundIntro = false;
  let consecutiveNonIntro = 0;
  let firstNonIntroMs = -1;

  for (let i = 0; i < lines.length; i++) {
    if (startMsValues[i] > MAX_INTRO_SCAN_MS) break;

    const text = lines[i].replace(/^\[\d+\]\s*/, "");
    const isIntro = isIntroLine(text);

    if (isIntro) {
      foundIntro = true;
      consecutiveNonIntro = 0;
      firstNonIntroMs = -1; // reset — this line is still intro
    } else {
      if (firstNonIntroMs === -1) firstNonIntroMs = startMsValues[i];
      consecutiveNonIntro++;
      // Require 2 consecutive non-intro lines to confirm intro ended
      if (consecutiveNonIntro >= 2 && foundIntro) {
        return firstNonIntroMs;
      }
    }
  }

  // Intro detected but only 1 trailing non-intro line before scan limit
  if (foundIntro && firstNonIntroMs >= 0) return firstNonIntroMs;

  return 0; // no intro detected → no filtering
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
export async function smartClipVideo(
  tokens: Token[],
  contentProfile?: ContentProfile | null
): Promise<SmartClip[]> {
  if (tokens.length === 0) return [];

  const { lines, startMsValues } = buildLabeledTranscript(tokens);
  const totalSec = Math.round(tokens[tokens.length - 1].endMs / 1000);
  const transcript = lines.join("\n");

  // ── Deterministic intro detection ─────────────────────────────────────────
  // Filter timestamps that fall inside the intro zone BEFORE passing to Claude.
  // This prevents Claude from picking intro timestamps regardless of its
  // instruction-following — if the timestamp isn't in validStarts, Claude
  // cannot choose it.
  const introEndMs = detectIntroEndMs(tokens);
  if (introEndMs > 0) {
    console.log(`[smart-clipper] Intro detected — blocking timestamps before ${introEndMs}ms (${Math.round(introEndMs / 1000)}s)`);
  }

  const allowedStartMs = introEndMs > 0
    ? startMsValues.filter((ms) => ms >= introEndMs)
    : startMsValues;

  // Build a compact list of valid start timestamps for the prompt
  const validStarts = allowedStartMs.join(", ");

  // Duration range: from profile or default
  const minDuration = contentProfile?.optimal_duration_min ?? 20;
  const maxDuration = contentProfile?.optimal_duration_max ?? 60;

  // Build profile context section if available
  const profileSection = contentProfile
    ? `\n${getProfileContext(contentProfile)}\n`
    : "";

  // Scoring criteria adapted based on whether we have a profile
  const scoringCriteria = contentProfile?.niche
    ? `CRITERIOS DE SCORING (adaptados al nicho "${contentProfile.niche}"):
• 90-100: Gancho perfecto para este nicho + duración óptima + tema alineado con el perfil
• 70-89: Buen gancho + tema relacionado pero duración o estilo no óptimos
• 50-69: Contenido relevante pero gancho débil para este nicho
• <50: No encaja bien con el perfil de la cuenta`
    : `CRITERIOS DE SCORING:
• 90-100: Gancho excepcional + cierre perfecto + alto potencial viral
• 70-89: Buen gancho + contenido sólido
• 50-69: Gancho aceptable pero mejorable
• <50: Gancho débil o contenido poco engaging`;

  const prompt = `Sos un editor experto en contenido viral para TikTok, Instagram Reels y YouTube Shorts.

Analizás la transcripción de un video de ${totalSec}s en español. Cada línea empieza con [ms] — el timestamp en milisegundos del inicio de esa frase.
${profileSection}
MISIÓN: identificar los mejores momentos para hacer clips virales${contentProfile?.niche ? ` para el nicho de ${contentProfile.niche}` : ""}.

PASO 1 — IDENTIFICAR ZONA DE INTRO (hacelo antes de proponer clips):
Leé las primeras líneas del transcript. Si empiezan con alguno de estos patrones, toda esa sección es "ZONA DE INTRO" y NINGÚN clip puede empezar ahí:
• Saludos: "Hola", "Muy buenas", "Buenos días/tardes/noches", "Qué tal", "Bienvenidos", "Cómo están"
• Saludar a alguien por nombre: "Muy buenas [nombre]", "Hola [nombre]"
• Presentar el episodio: "En el video de hoy", "Hoy vamos a ver", "En este episodio", "Les traigo", "Hoy te enseño"
• Autopresentarse: "Mi nombre es", "Soy [nombre]", "Me llamo", "Les habla"
• Contexto/relleno: "Antes de empezar", "Como siempre", "No olvides suscribirte"

PASO 2 — HOOKS VÁLIDOS (así debe empezar cada clip):
• Pregunta directa que genera intriga o curiosidad
• Dato sorprendente o cifra concreta con impacto
• Declaración emocional o de tensión ya en acción
• Promesa de valor específica y concreta
• Historia con conflicto activo desde la primera frase
• Afirmación contraintuitiva o polémica
• Resultado antes/después concreto

REGLAS CRÍTICAS:
• PROHIBIDO: usar cualquier timestamp de la ZONA DE INTRO como start_ms de un clip
• El start_ms del PRIMER clip debe ser el timestamp de la primera frase HOOK VÁLIDO que aparezca DESPUÉS de la ZONA DE INTRO, aunque esté a 60, 90 o 120 segundos del inicio
• El final de cada clip debe cerrar la idea — nunca cortar a mitad de oración
• Duración ideal: ${minDuration}-${maxDuration} segundos por clip
• Encontrá entre 3 y 8 clips — el mínimo es 3, más clips = mejor resultado para el usuario
• Los clips NO se deben solapar: el start_ms de cada clip debe ser mayor al end_ms del anterior
• start_ms y end_ms DEBEN ser valores exactos de esta lista: ${validStarts}

${scoringCriteria}

TRANSCRIPCIÓN:
${transcript}

Respondé ÚNICAMENTE con un JSON array válido (sin markdown, sin texto adicional):
[{"start_ms":<número>,"end_ms":<número>,"hook":"<frase exacta de inicio>","reason":"<por qué es un buen gancho, una oración en español>","score":<número entero 0-100 de potencial viral>}]`;

  let raw = "";
  try {
    const response = await getClient().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
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
      .filter((c) => c.end_ms - c.start_ms >= 15_000); // at least 15s (TikTok/Reels minimum)

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

    // Post-filter: remove any clips whose snapped start_ms fell inside the
    // intro zone (can happen if snapToToken pulled a timestamp slightly back).
    const filtered = introEndMs > 0
      ? nonOverlapping.filter((c) => c.start_ms >= introEndMs)
      : nonOverlapping;

    if (filtered.length < nonOverlapping.length) {
      console.log(`[smart-clipper] Removed ${nonOverlapping.length - filtered.length} intro clip(s) after snap`);
    }

    return filtered;
  } catch (err) {
    console.warn("[smart-clipper] Failed to parse Claude response:", err);
    console.warn("[smart-clipper] Raw response:", raw.slice(0, 300));
    return []; // caller will fall back to pause-based segmentation
  }
}
