# Changelog

All notable changes to AI Video Studio are documented here.

## [1.0.0] — 2026-04-10

### Initial Release

#### New Components (35 total)

**Text:**
- `AnimatedTitle` — animated title with enter/exit animations
- `TypewriterText` — typewriter-style text reveal
- `WordByWordCaption` — word-by-word caption with highlight
- `LowerThird` — broadcast-style lower third
- `CaptionOverlay` — full caption overlay
- `KaraokeCaption` — karaoke-style word highlighting with color progression
- `MorphingText` — smooth blur morph between cycling words/phrases

**Backgrounds:**
- `GradientBackground` — animated gradient background
- `ParticleField` — animated particle field
- `GridPattern` — grid/dot pattern background
- `ColorWash` — color wash animation
- `GlassmorphismCard` — glassmorphism card with ambient glow

**Overlays:**
- `ProgressBar` — video progress bar
- `Watermark` — branding watermark
- `CallToAction` — animated CTA banner
- `CountdownTimer` — countdown timer
- `NeonGlow` — neon glow text with flicker simulation
- `SocialCounter` — animated social media count-up (K/M formatting)
- `FloatingTag` — floating annotation tag with directional arrow
- `EmojiReaction` — floating emoji reactions that rise and fade

**Media:**
- `VideoClip` — video clip with trim support
- `JumpCut` — jump cut sequencer
- `AudioTrack` — audio track with fade in/out
- `FitVideo` — video fit with zoom support
- `FitImage` — image fit with pan/zoom
- `Slideshow` — multi-image slideshow

**Layout:**
- `SplitScreen` — side-by-side split screen
- `PictureInPicture` — PiP overlay
- `SafeArea` — platform-safe padding container

**Transitions:**
- 12 transition presets (Fade, SlideLeft, SlideRight, SlideUp, SlideDown, ZoomIn, ZoomOut, Wipe, CrossFade, Push, Reveal, Blur)

#### New Templates (15 total)

- `TikTokVideo` — 9:16 TikTok optimized
- `InstagramReel` — 9:16 Reel with Reel-specific pacing
- `YouTubeShort` — 9:16 Short with subscribe CTA
- `LinkedInPost` — 1:1 professional insight format
- `Presentation` — slide-style presentation
- `Testimonial` — social proof compilation
- `Announcement` — launch/announcement format
- `BeforeAfter` — side-by-side comparison
- `CoursePromo` — full course launch promo with morphing benefits + price reveal
- `TalkingHeadEdit` — auto-edited talking head with jump cuts + captions
- `PodcastClip` — podcast quote card

#### AI Skill Packs (10 total)

- `remotion-best-practices` — Remotion architecture and patterns
- `motion-designer` — animation principles and timing
- `awwwards-animations` — award-level animation patterns
- `animated-component-libraries` — component composition strategies
- `explainer-video-guide` — explainer video structure
- `ffmpeg` — video processing pipeline
- `remotion-render` — rendering and codec optimization
- `playwright-mcp` — web content scraping
- `viral-hooks` — 8 proven hook patterns for social content
- `creator-formats` — platform-specific content formats and pacing

#### Features

- One-command setup via `/start` in Claude Code
- Path A: Create video from natural language description
- Path B: Edit existing footage with auto-transcription and jump cuts
- Local AI transcription via Whisper.cpp (no API key)
- AI background removal via @imgly/background-removal
- 10 platform dimension presets
- 5 color palettes (dark, light, vibrant, warm, cool, neon, brand)
- Bilingual support (English / Español)
