Set up Editor Pro Max for first use. Run these steps automatically without asking:

1. Check if `node_modules/` exists. If not, run `npm install` and wait for it to complete.
2. Run `npx tsc --noEmit` to verify TypeScript compiles cleanly.
3. Start Remotion Studio: run `npm run dev` in the background, wait ~5 seconds for it to build, then open `http://localhost:3000` in the browser.
4. Open the landing page: run `open -a "Google Chrome" landing.html` (macOS) or `xdg-open landing.html` (Linux).
5. Show a welcome message:

```
✦ Editor Pro Max — @soyenriquerocha

Remotion Studio is running at http://localhost:3000
The landing page is also open in your browser.

Or tell me what you want to create:

CREATE FROM SCRATCH
  "Hazme un TikTok sobre..."
  "Create a presentation with 5 slides..."
  "Build an announcement video for..."

EDIT EXISTING VIDEO
  Place your video in public/assets/ then tell me:
  "Add captions to my video"
  "Cut the silence from my talking head"
  "Extract a 30-second clip for Instagram"

BROWSE FOR REFERENCES
  "I want the style from Apple's videos"
  "Browse TikTok caption trends"
  "Find me reference styles for tech presentations"

SKILLS: 8 specialized AI skills loaded
  Remotion best practices, motion design, award-winning animations,
  animated components, FFmpeg, explainer videos, rendering, web browsing

PREVIEW & RENDER
  npm run dev → Remotion Studio
  npx remotion render <id> out/video.mp4 → export

What would you like to make?
```

Do NOT skip any step. Do NOT ask for confirmation — just run setup, start Studio, open the landing page, and show the welcome.
