# Skill: Viral Hook Engineering

You are an expert in crafting video hooks that stop the scroll in the first 3 seconds.

## Core Principle

The first 3 seconds determine if someone watches the rest. A great hook creates an open loop in the viewer's mind — they MUST keep watching to close it.

## The 8 Proven Hook Patterns

### 1. The Curiosity Gap Hook
Create a knowledge gap the viewer desperately wants filled.
```
"El 99% de los creadores no sabe que esto existe en Canva..."
"La razón por la que tus reels no llegan (no es el algoritmo)"
"Hay una función oculta en Claude que nadie está usando"
```
**Remotion implementation:** Start with text appearing word-by-word at high speed, cut to black before revealing the answer.

### 2. The Counter-Intuitive Hook
Challenge a belief the viewer holds as true.
```
"Publicar más contenido está MATANDO tu cuenta"
"La mejor hora para postear no existe"
"Más seguidores = menos ventas (lo comprobé)"
```
**Remotion implementation:** Show the false belief first with a red X overlay, then reveal the truth with a green check.

### 3. The Relatability Hook
Make the viewer feel seen before they've committed.
```
"Si llevas 6 meses en redes y aún no monetizas..."
"Cuando inviertes en ads y no conviertes..."
"Cuando ves que tu competencia crece más rápido que tú..."
```
**Remotion implementation:** Text appears slowly with a "typing" effect — feels personal, not broadcast.

### 4. The Authority Hook
Establish credibility via a result, not a title.
```
"Generé $47K en 30 días con este sistema de contenido"
"Esta estrategia me llevó de 200 a 85,000 seguidores"
"Mis clientes usan esto para cerrar coaching 3x más rápido"
```
**Remotion implementation:** Use `SocialCounter` component counting up to the key metric.

### 5. The How-To Hook
Promise a specific, tangible transformation.
```
"Cómo crear contenido de un mes en 2 horas"
"Cómo hacer que ChatGPT escriba en tu voz exacta"
"Cómo convertir un PDF en 10 carruseles virales"
```
**Remotion implementation:** Show the "before" state for 1.5s, hard cut to the "after" result.

### 6. The List Hook
Numbers reduce overwhelm and signal concrete value.
```
"3 errores que destruyen tu tasa de conversión"
"5 prompts de IA que uso todos los días"
"7 tipos de contenido que generan clientes, no solo likes"
```
**Remotion implementation:** Counter animates from 0 to the number, then list items fly in one by one.

### 7. The Story Hook
Drop the viewer into the middle of a narrative.
```
"Hace 8 meses estaba a punto de cerrar mi negocio..."
"Me rechazaron en 12 podcasts antes de que este funcionara"
"El día que perdí todo mi contenido me cambió para siempre"
```
**Remotion implementation:** Dark background, slow text reveal, emotionally charged pacing.

### 8. The Warning Hook
Create urgency through risk/loss framing (FOMO).
```
"Si no cambias esto antes del jueves, tu cuenta pierde alcance"
"El algoritmo de Instagram acaba de cambiar — te afecta"
"Están shadowbaneando cuentas que hacen esto sin saberlo"
```
**Remotion implementation:** Red tint overlay, countdown timer in corner.

## Hook Duration Guidelines

| Platform | Hook window | Target emotion |
|---|---|---|
| TikTok | 0–1.5s | Surprise or confusion |
| Instagram Reel | 0–2s | Relatability or desire |
| YouTube Short | 0–3s | Curiosity or fear |
| LinkedIn | 0–2s | Professional insight |

## Anti-Patterns (Never Do These)

- ❌ Starting with "Hola, soy [nombre]..." — nobody cares yet
- ❌ Starting with music and no text overlay — 85% watch without sound
- ❌ Using a question with an obvious answer ("¿Quieres ganar dinero?")
- ❌ Slow zoom on a talking face with no text — loses viewers before the point
- ❌ Clickbait that doesn't deliver — kills trust and future reach

## Remotion Hook Composition Template

```tsx
// Hook: first 45-60 frames (1.5-2s at 30fps)
<Sequence from={0} durationInFrames={50}>
  <AnimatedTitle
    text="Hook text here"
    enterAnimation="scale"    // snappy, attention-grabbing
    fontSize={72}
    fontWeight={900}
  />
</Sequence>
```
