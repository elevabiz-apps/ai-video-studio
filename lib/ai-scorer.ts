import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export type ClipScore = {
  score: number;      // 0-100
  reasoning: string;  // one sentence in Spanish
};

/**
 * Uses Claude to score a clip's social media engagement potential (0-100).
 * Criteria: strong hook, conciseness, emotional value, viral potential.
 */
export async function scoreClip(text: string): Promise<ClipScore> {
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `Analizá este fragmento de video en español para redes sociales (TikTok, Instagram Reels, YouTube Shorts).

Texto del clip:
"${text}"

Puntuá del 0 al 100 su potencial de engagement según estos criterios:
- ¿Tiene un gancho fuerte al inicio?
- ¿Es conciso y aporta valor real?
- ¿Genera emoción, curiosidad o identificación?
- ¿Tiene potencial de ser compartido o comentado?

Respondé ÚNICAMENTE con este JSON (sin markdown, sin texto adicional):
{"score": <número entero del 0 al 100>, "reasoning": "<una oración corta en español explicando el puntaje>"}`,
      },
    ],
  });

  const block = response.content[0];
  if (block.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  // Strip any accidental markdown code fences
  const raw = block.text.trim().replace(/^```json?\n?/, "").replace(/\n?```$/, "");

  let parsed: { score: unknown; reasoning: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Failed to parse Claude response as JSON: ${raw}`);
  }

  return {
    score: Math.max(0, Math.min(100, Number(parsed.score))),
    reasoning: String(parsed.reasoning),
  };
}
