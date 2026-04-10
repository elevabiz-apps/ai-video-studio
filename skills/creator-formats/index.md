# Skill: Creator Content Formats

You understand the dominant content formats across social platforms and how to execute them in Remotion for maximum reach and engagement.

## Format Taxonomy

### Educational / Tutorial
**Goal:** Transfer knowledge in the shortest time possible.
**Structure:** Hook → Problem → Solution → Implementation → CTA
**Duration:** 30–90s for short form, 8–15min for YouTube
**Key mechanics:**
- Visual confirmation of every verbal claim
- Numbered steps with progress indicator
- Before/after comparison at the end
- "Save this" or "share if you agree" CTA

**Remotion components to use:**
- `ProgressBar` — shows step progress
- `LowerThird` — labels each step
- `CallToAction` — "Guarda este video"
- `WordByWordCaption` — for step-by-step narration

### Talking Head Edit
**Goal:** Turn a raw interview or talking head video into a tight, engaging clip.
**Structure:** Auto-transcribe → Remove silence → Add captions → Add B-roll cues
**Duration:** Keep to <60s for reels, <3min for YouTube
**Key mechanics:**
- Jump cuts every 3–5s to maintain energy
- Captions always on (85% of viewers watch muted)
- Lower thirds for speaker ID
- Reaction inserts or zoom-in for emphasis

**Pipeline:**
```bash
scripts/extract-audio.ts → scripts/transcribe.ts → scripts/detect-silence.ts
```

### Listicle / Countdown
**Goal:** High shareability through digestible structure.
**Structure:** "X things that..." → Items revealed in reverse order → #1 reveal as the payoff
**Duration:** 30–60s
**Key mechanics:**
- Number counter overlay that counts down
- Each item gets 3–5s screen time
- Suspense pause before #1
- "Which one did you already know?" CTA drives comments

### Product Demo / Tutorial
**Goal:** Show a product/tool in action to drive clicks or sales.
**Structure:** Problem → "What if..." → Feature 1 → Feature 2 → Feature 3 → Price/CTA
**Duration:** 60–120s for ads, 3–8min for YouTube
**Key mechanics:**
- Screen recordings for software (use FitVideo with zoom)
- CallToAction with price anchor
- Countdown timer for urgency
- Testimonial quote overlaid (use LowerThird)

### Reaction / Commentary
**Goal:** Piggyback on trending content for reach.
**Structure:** Show original content → Commentary/reaction → Takeaway
**Duration:** 30–60s
**Key mechanics:**
- PictureInPicture for dual-screen view
- FloatingTag for commentary callouts
- Strong opinion stated in hook
- Comment-bait question at end

### Behind the Scenes / Vlog
**Goal:** Build trust and humanize the brand.
**Structure:** Setup → Journey → Result → Lesson learned
**Duration:** 60–180s
**Key mechanics:**
- Lower energy, more authentic pacing
- Watermark with handle always visible
- End with a personal takeaway or failure lesson
- "Day in the life" title cards

## Platform-Specific Format Rules

### TikTok
- Hook in first 1.5s — face or bold text
- Keep under 30s for max boost, 60s for depth
- Trending audio increases reach 2–3x
- Captions required (85% silent viewers)
- Vertical 9:16 always

### Instagram Reels
- Hook in first 2s — same as TikTok
- 15–30s optimal, up to 90s acceptable
- Avoid TikTok watermarks (algorithm suppression)
- High production value rewards (Instagram values polish)
- 9:16 vertical

### YouTube Shorts
- 60s max, 15–30s sweet spot for discovery
- Thumbnail still matters (shown in feed)
- Subscribe CTA mid-video increases conversion
- 9:16 vertical

### LinkedIn
- 1:1 square (1080x1080) for feed
- Professional insight > entertainment
- 30–60s
- Captions always — professional context = silent viewing
- End with a question to drive comments (LinkedIn rewards comments)

## Viral Content Formulas

### The 3-Word Transformation
"[Before state] → [After state]"
Example: "0 clientes → 20 clientes en 60 días con IA"

### The Specific Outcome Promise
"[Exact action] + [Timeframe] + [Specific result]"
Example: "Graba 1 video. Obtén 30 piezas de contenido. En menos de 1 hora."

### The Proof Stack
Result → How → Why it works → Your result
(Never claim → always show)

## Pacing Reference by Platform

| Platform | Cuts per minute | Text time on screen | Energy level |
|---|---|---|---|
| TikTok | 20–40 | 2–4s per card | High |
| Reels | 15–25 | 3–5s per card | Medium-high |
| YouTube Short | 12–20 | 4–6s per card | Medium |
| LinkedIn | 8–15 | 4–8s per card | Low-medium |
