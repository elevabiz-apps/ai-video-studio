# Contributing to AI Video Studio

Thanks for your interest in contributing! This guide covers how to add new components, templates, and skill packs.

## Quick Start

```bash
git clone https://github.com/highvalue-llc/ai-video-studio.git
cd ai-video-studio
npm install
```

## Types of Contributions

### New Components

Components live in `src/components/` organized by category:
- `text/` — captions, titles, subtitles
- `backgrounds/` — visual backgrounds and cards
- `overlays/` — UI elements overlaid on video (CTAs, badges, counters)
- `media/` — video/image handling components
- `layout/` — positioning and layout helpers
- `transitions/` — cut transitions between sequences

**Conventions:**
1. Export a typed `Props` interface named `[ComponentName]Props`
2. Use `useCurrentFrame()` and `useVideoConfig()` for animation
3. Use `spring()` from Remotion for entrance animations
4. Call `loadGoogleFont()` for any custom font rendering
5. Default all props to sensible values

**Example skeleton:**
```tsx
import React from "react";
import { useCurrentFrame, useVideoConfig, spring } from "remotion";
import { FONT_FAMILIES, loadGoogleFont } from "../../presets/fonts";

export interface MyComponentProps {
  text: string;
  color?: string;
  enterDelay?: number;
}

export const MyComponent: React.FC<MyComponentProps> = ({
  text,
  color = "#ffffff",
  enterDelay = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // your animation logic here
  return <div style={{ color }}>{text}</div>;
};
```

### New Templates

Templates live in `src/templates/` organized by use case:
- `social/` — TikTok, Reels, Shorts, LinkedIn
- `content/` — presentations, testimonials, tutorials
- `promo/` — product promos, course launches, announcements
- `editing/` — templates for editing raw footage

**Conventions:**
1. Always include dimensions comment (e.g., `1080x1920 @ 30fps`)
2. Include a `durationInFrames` comment on the component
3. Use `Sequence` for timing all elements
4. Use `SafeArea` to keep content away from platform UI chrome
5. Export typed `Props` interface

### New Skill Packs

Skill packs are markdown files in `skills/` that Claude Code reads for domain knowledge.

**Conventions:**
1. Create a folder `skills/your-skill-name/`
2. Add `index.md` as the main skill file
3. Use clear headings, code examples, and tables
4. Focus on actionable guidance, not theory
5. Include Remotion-specific implementation notes

### Bug Reports

Please include:
- Node.js version (`node --version`)
- Claude Code CLI version (`claude --version`)
- The composition or template causing the issue
- Full error message / stack trace

## Code Style

- TypeScript strict mode — no `any`
- Prefer `const` over `let`
- Use named exports (no default exports)
- Props interfaces always explicit — no implicit props

## Pull Request Process

1. Fork the repo and create a feature branch
2. Make your changes with clear, focused commits
3. Ensure `npm run build` passes with no TypeScript errors
4. Open a PR with a clear description of what you added and why
5. Include a screenshot or short video of the output if adding a visual component

## License

By contributing, you agree your contributions are licensed under the MIT License.
