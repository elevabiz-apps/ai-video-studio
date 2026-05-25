#!/usr/bin/env python3
"""
Burn karaoke-style subtitles into a video clip.

Method: save processed frames as JPEG sequence → encode with ffmpeg image2.
This is the most reliable approach on macOS — no VideoWriter codec issues.

Presets: bold (karaoke), classic (simple white), outline (heavy outline),
         glow (bright highlight + shadow), box (semi-transparent background).

Subword handling: Whisper tokenizes at subword level (e.g. " aud" + "iencia").
Tokens without a leading space are merged with the previous word for display.

Usage:
  python3 scripts/burn-subtitles.py <clip_path> <captions_json>
      <clip_start_ms> <clip_end_ms> <ffmpeg_path> <compositor_dir> [offset_ms] [preset]
"""
import sys, json, os, tempfile, shutil, subprocess
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

if len(sys.argv) < 7:
    print("Usage: burn-subtitles.py <clip> <captions.json> "
          "<start_ms> <end_ms> <ffmpeg> <compositor_dir> [offset_ms]", file=sys.stderr)
    sys.exit(1)

CLIP_PATH      = sys.argv[1]
CAPTIONS_JSON  = sys.argv[2]
CLIP_START_MS  = float(sys.argv[3])
CLIP_END_MS    = float(sys.argv[4])
FFMPEG         = sys.argv[5]
COMPOSITOR_DIR = sys.argv[6]
OFFSET_MS      = float(sys.argv[7]) if len(sys.argv) > 7 else 150
PRESET         = sys.argv[8] if len(sys.argv) > 8 else "bold"

os.environ["DYLD_LIBRARY_PATH"] = COMPOSITOR_DIR

MAX_WORDS    = 6      # max FULL WORDS per subtitle line (not subword tokens)
TEXT_Y_RATIO = 0.72
MARGIN_X     = 60


# ── Subword merging ───────────────────────────────────────────────────────────

def merge_subword_tokens(raw_tokens: list) -> list:
    """
    Merge Whisper subword tokens into full visual words.

    Whisper outputs subword pieces. A token that does NOT start with a space
    is a continuation of the previous word, e.g.:
        " aud"  (startMs=3560)
        "iencia" (startMs=3700)
      → merged: "audiencia" (startMs=3560, endMs=4000)

    Returns list of dicts: {text, startMs, endMs, subtokens}
    subtokens = original raw tokens that form this word (for per-token coloring if needed).
    """
    merged = []
    for t in raw_tokens:
        raw = t["text"]
        # A token is a new word if it starts with a space OR it's the very first token
        is_new_word = raw.startswith(" ") or len(merged) == 0
        if is_new_word:
            text = raw.lstrip(" ")
            if text:  # skip pure-space tokens
                merged.append({
                    "text": text,
                    "startMs": t["startMs"],
                    "endMs":   t["endMs"],
                    "subtokens": [t],
                })
        else:
            # Suffix token: append to last word without any space
            if merged:
                merged[-1]["text"] += raw
                merged[-1]["endMs"] = t["endMs"]
                merged[-1]["subtokens"].append(t)
            else:
                # Edge case: first token has no leading space
                text = raw.strip()
                if text:
                    merged.append({
                        "text": text,
                        "startMs": t["startMs"],
                        "endMs":   t["endMs"],
                        "subtokens": [t],
                    })
    # Remove empty words and words that are only punctuation with no duration
    return [w for w in merged if w["text"].strip()]


# ── Captions → phrases ────────────────────────────────────────────────────────
with open(CAPTIONS_JSON, "r") as f:
    all_tokens = json.load(f)

clip_tokens = [t for t in all_tokens
               if t["endMs"] > CLIP_START_MS and t["startMs"] < CLIP_END_MS]

# Merge subword tokens into full words first
all_words = merge_subword_tokens(clip_tokens)

# Now group into phrases of MAX_WORDS full words
phrases = []
i = 0
while i < len(all_words):
    g = all_words[i : i + MAX_WORDS]
    phrases.append({
        "startMs": g[0]["startMs"],
        "endMs":   g[-1]["endMs"],
        "words":   g,
    })
    i += MAX_WORDS


def phrase_at(abs_ms: float):
    """Return the phrase dict active at abs_ms, or None."""
    for p in phrases:
        if p["startMs"] <= abs_ms < p["endMs"]:
            return p
    return None


# ── Open video ────────────────────────────────────────────────────────────────
cap    = cv2.VideoCapture(CLIP_PATH)
fps    = cap.get(cv2.CAP_PROP_FPS) or 30.0
width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
total  = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
print(f"[subtitles] {width}x{height} @ {fps:.2f}fps · {total} frames "
      f"· {len(all_words)} words → {len(phrases)} phrases · offset={OFFSET_MS}ms "
      f"· preset={PRESET}",
      file=sys.stderr)

# ── Font ──────────────────────────────────────────────────────────────────────
FONT_SIZE  = max(24, height // 36)
OUTLINE_PX = max(2, FONT_SIZE // 11)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

font = ImageFont.load_default()
for fp in [
    # Bundled font (cross-platform, always available)
    os.path.join(SCRIPT_DIR, "fonts", "Inter-Bold.ttf"),
    # macOS system fonts
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    # Linux system fonts
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
]:
    if os.path.exists(fp):
        try:
            font = ImageFont.truetype(fp, FONT_SIZE)
            break
        except Exception:
            pass

# ── Preset definitions ───────────────────────────────────────────────────────
# Each preset defines: karaoke (per-word coloring), colors, outline, box bg
PRESETS = {
    "bold": {
        "karaoke": True,
        "active": (255, 255, 255),
        "past": (210, 210, 210),
        "future": (150, 150, 150),
        "outline": (0, 0, 0),
        "outline_px": OUTLINE_PX,
        "box": False,
        "glow": False,
    },
    "classic": {
        "karaoke": False,
        "active": (255, 255, 255),
        "past": (255, 255, 255),
        "future": (255, 255, 255),
        "outline": (0, 0, 0),
        "outline_px": max(1, OUTLINE_PX - 1),
        "box": False,
        "glow": False,
    },
    "outline": {
        "karaoke": True,
        "active": (255, 255, 255),
        "past": (200, 200, 200),
        "future": (120, 120, 120),
        "outline": (0, 0, 0),
        "outline_px": max(3, OUTLINE_PX + 2),
        "box": False,
        "glow": False,
    },
    "glow": {
        "karaoke": True,
        "active": (255, 255, 100),
        "past": (220, 220, 220),
        "future": (140, 140, 140),
        "outline": (0, 0, 0),
        "outline_px": OUTLINE_PX,
        "box": False,
        "glow": True,
    },
    "box": {
        "karaoke": True,
        "active": (255, 255, 255),
        "past": (220, 220, 220),
        "future": (170, 170, 170),
        "outline": (0, 0, 0),
        "outline_px": max(1, OUTLINE_PX - 1),
        "box": True,
        "glow": False,
    },
}

style = PRESETS.get(PRESET, PRESETS["bold"])


def draw_subtitle(frame_bgr: np.ndarray, phrase: dict, current_ms: float) -> np.ndarray:
    """
    Draw subtitle with preset-based styling.
    Supports karaoke (per-word coloring), box background, glow effect, and outline.
    """
    words = phrase["words"]
    img  = Image.fromarray(cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB))
    draw = ImageDraw.Draw(img)

    # Assign color per word based on timing and preset
    colored = []
    for w in words:
        if not w["text"]:
            continue
        if style["karaoke"]:
            if current_ms >= w["startMs"]:
                color = style["active"] if current_ms < w["endMs"] else style["past"]
            else:
                color = style["future"]
        else:
            color = style["active"]
        colored.append({"text": w["text"], "color": color})

    if not colored:
        return frame_bgr

    # Measure widths
    space_w = max(int(draw.textlength(" ", font=font)), 4)
    measured = []
    total_w  = 0
    for j, cw in enumerate(colored):
        bbox = draw.textbbox((0, 0), cw["text"], font=font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        measured.append({"text": cw["text"], "color": cw["color"], "w": tw, "h": th})
        total_w += tw
        if j < len(colored) - 1:
            total_w += space_w

    # Drop trailing words until the line fits (never truncate within a word)
    while total_w > width - MARGIN_X * 2 and len(measured) > 1:
        removed = measured.pop()
        total_w -= removed["w"] + space_w

    max_h = max(m["h"] for m in measured)
    x = (width - total_w) // 2
    y = int(height * TEXT_Y_RATIO) - max_h // 2

    outline_px = style["outline_px"]
    outline_color = style["outline"]

    # Draw box background if preset requires it
    if style["box"]:
        pad = FONT_SIZE // 3
        box_x0 = x - pad
        box_y0 = y - pad
        box_x1 = x + total_w + pad
        box_y1 = y + max_h + pad
        # Semi-transparent overlay via composite
        overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
        overlay_draw = ImageDraw.Draw(overlay)
        overlay_draw.rounded_rectangle(
            [box_x0, box_y0, box_x1, box_y1],
            radius=pad // 2,
            fill=(0, 0, 0, 160)
        )
        img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
        draw = ImageDraw.Draw(img)

    # Draw glow layer if preset requires it
    if style["glow"]:
        glow_px = outline_px + 3
        glow_color = (255, 255, 50, 60)
        # Draw a diffuse layer behind text
        for m_idx, m in enumerate(measured):
            cx = x + sum(measured[j]["w"] + space_w for j in range(m_idx))
            for dx in range(-glow_px, glow_px + 1, 2):
                for dy in range(-glow_px, glow_px + 1, 2):
                    draw.text((cx + dx, y + dy), m["text"], font=font, fill=(80, 80, 0))

    # Draw each word with outline + fill
    cx = x
    for m in measured:
        for dx in range(-outline_px, outline_px + 1):
            for dy in range(-outline_px, outline_px + 1):
                if dx == 0 and dy == 0:
                    continue
                draw.text((cx + dx, y + dy), m["text"], font=font, fill=outline_color)
        draw.text((cx, y), m["text"], font=font, fill=m["color"])
        cx += m["w"] + space_w

    return cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)


# ── Save frames as JPEG sequence ──────────────────────────────────────────────
tmp_dir    = tempfile.mkdtemp()
frames_dir = os.path.join(tmp_dir, "frames")
os.makedirs(frames_dir)
tmp_aud = os.path.join(tmp_dir, "audio.wav")
tmp_out = os.path.join(tmp_dir, "output.mp4")

frame_idx    = 0
REPORT_EVERY = 50

while True:
    pos_ms = frame_idx * 1000.0 / fps  # deterministic — cv2 POS_MSEC can drift
    ret, frame = cap.read()
    if not ret:
        break
    abs_ms = pos_ms + CLIP_START_MS - OFFSET_MS  # subtract to DELAY subtitles
    phrase = phrase_at(abs_ms)
    if phrase:
        frame = draw_subtitle(frame, phrase, abs_ms)
    cv2.imwrite(os.path.join(frames_dir, f"{frame_idx:06d}.jpg"), frame,
                [cv2.IMWRITE_JPEG_QUALITY, 85])
    frame_idx += 1
    if frame_idx % REPORT_EVERY == 0:
        print(f"  {frame_idx}/{total}", file=sys.stderr)

cap.release()
print(f"  Saved {frame_idx} frames", file=sys.stderr)

# ── Extract audio ────────────────────────────────────────────────────────────
# The clip already has clean re-encoded AAC from cutClip() — just extract to WAV.
# No aresample=async needed (it caused audio repeat artifacts via sample insertion).
subprocess.run(
    [FFMPEG, "-i", CLIP_PATH, "-vn",
     "-ar", "48000",
     "-y", tmp_aud],
    capture_output=True, env={**os.environ}
)
has_audio = os.path.exists(tmp_aud) and os.path.getsize(tmp_aud) > 1000

# ── Encode JPEG sequence + audio → MP4 ───────────────────────────────────────
cmd = [
    FFMPEG, "-y",
    "-framerate", str(fps),
    "-i", os.path.join(frames_dir, "%06d.jpg"),
]
if has_audio:
    cmd += ["-i", tmp_aud]
cmd += [
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
    "-pix_fmt", "yuv420p",
    # Note: no -vf setpts needed — image2 input already starts at PTS=0
    # (Remotion's ffmpeg build has setpts filter disabled)
]
if has_audio:
    cmd += [
        "-c:a", "aac", "-b:a", "128k",
        "-map", "0:v", "-map", "1:a",
        "-shortest",
    ]
cmd += [tmp_out]

print(f"[subtitles] Encoding final MP4...", file=sys.stderr)
r = subprocess.run(cmd, capture_output=False, stderr=None, env={**os.environ})
if r.returncode != 0:
    print(f"[subtitles] encode failed (code {r.returncode})", file=sys.stderr)
    shutil.rmtree(tmp_dir)
    sys.exit(1)

shutil.move(tmp_out, CLIP_PATH)
shutil.rmtree(tmp_dir)
print(f"[subtitles] done {os.path.basename(CLIP_PATH)}", file=sys.stderr)
