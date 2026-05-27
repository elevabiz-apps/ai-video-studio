#!/usr/bin/env python3
"""
Burn karaoke-style subtitles into a video using ffmpeg's ASS subtitle filter.

Much faster and lower memory than the OpenCV frame-by-frame approach:
- Generates an ASS file from word-level captions JSON
- Runs ffmpeg once with -vf ass=file.ass (streaming, no per-frame storage)
- libass handles karaoke coloring via \\k tags

Usage:
  python3 scripts/burn-subtitles.py <clip_path> <captions_json>
      <clip_start_ms> <clip_end_ms> <ffmpeg_path> <compositor_dir> [offset_ms] [preset]
"""
import sys, json, os, tempfile, shutil, subprocess

if len(sys.argv) < 7:
    print("Usage: burn-subtitles.py <clip> <captions.json> "
          "<start_ms> <end_ms> <ffmpeg> <compositor_dir> [offset_ms] [preset]",
          file=sys.stderr)
    sys.exit(1)

CLIP_PATH      = sys.argv[1]
CAPTIONS_JSON  = sys.argv[2]
CLIP_START_MS  = float(sys.argv[3])
CLIP_END_MS    = float(sys.argv[4])
FFMPEG         = sys.argv[5]
COMPOSITOR_DIR = sys.argv[6]
OFFSET_MS      = float(sys.argv[7]) if len(sys.argv) > 7 else 0
PRESET         = sys.argv[8] if len(sys.argv) > 8 else "bold"

MAX_WORDS = 2

# ── Helpers ───────────────────────────────────────────────────────────────────

def ms_to_ass(ms: float) -> str:
    """Convert ms to ASS time H:MM:SS.cc"""
    total_cs = max(0, int(ms / 10))
    cs = total_cs % 100
    total_s = total_cs // 100
    s = total_s % 60
    m = (total_s // 60) % 60
    h = total_s // 3600
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"

def merge_subword_tokens(raw_tokens: list) -> list:
    """Merge Whisper subword tokens into full visual words."""
    merged = []
    for t in raw_tokens:
        raw = t["text"]
        is_new_word = raw.startswith(" ") or len(merged) == 0
        if is_new_word:
            text = raw.lstrip(" ")
            if text:
                merged.append({"text": text, "startMs": t["startMs"], "endMs": t["endMs"]})
        else:
            if merged:
                merged[-1]["text"] += raw
                merged[-1]["endMs"] = t["endMs"]
            else:
                text = raw.strip()
                if text:
                    merged.append({"text": text, "startMs": t["startMs"], "endMs": t["endMs"]})
    return [w for w in merged if w["text"].strip()]

# ── Load captions ──────────────────────────────────────────────────────────────

with open(CAPTIONS_JSON, "r") as f:
    all_tokens = json.load(f)

clip_tokens = [t for t in all_tokens
               if t["endMs"] > CLIP_START_MS and t["startMs"] < CLIP_END_MS]

# Groq returns words without leading spaces; Whisper uses " word" prefix for new words.
# Detect which format we have and handle accordingly.
has_leading_spaces = any(t["text"].startswith(" ") for t in clip_tokens)
if has_leading_spaces:
    all_words = merge_subword_tokens(clip_tokens)
else:
    # Groq API: tokens are already individual words, no merging needed
    all_words = [{"text": t["text"].strip(), "startMs": t["startMs"], "endMs": t["endMs"]}
                 for t in clip_tokens if t["text"].strip()]

# Group into phrases of MAX_WORDS
phrases = []
i = 0
while i < len(all_words):
    g = all_words[i:i + MAX_WORDS]
    phrases.append({
        "startMs": g[0]["startMs"],
        "endMs":   g[-1]["endMs"],
        "words":   g,
    })
    i += MAX_WORDS

print(f"[subtitles] {len(all_words)} words → {len(phrases)} phrases · preset={PRESET}",
      file=sys.stderr)

# ── ASS style per preset ──────────────────────────────────────────────────────
# ASS colours: &HAABBGGRR (alpha, blue, green, red)

# Probe video dimensions for font size
FFPROBE = os.environ.get("FFPROBE_PATH",
    FFMPEG.replace("ffmpeg", "ffprobe") if "ffmpeg" in FFMPEG else "ffprobe")

probe_result = subprocess.run(
    [FFPROBE,
     "-v", "quiet", "-select_streams", "v:0",
     "-show_entries", "stream=width,height",
     "-print_format", "json", CLIP_PATH],
    capture_output=True, text=True
)
vid_width, vid_height = 1920, 1080
try:
    import json as _json
    probe_data = _json.loads(probe_result.stdout)
    stream = probe_data.get("streams", [{}])[0]
    vid_width  = stream.get("width",  1920)
    vid_height = stream.get("height", 1080)
except Exception:
    pass

FONT_SIZE = max(24, vid_height // 28)

# ASS colours: &HAABBGGRR  (alpha, blue, green, red)
# _uppercase: True → convert all subtitle text to UPPERCASE
# _font_scale: multiplier on top of FONT_SIZE
PRESET_STYLES = {
    # ── Plain presets ──────────────────────────────────────────────────────
    "bold": {
        "PrimaryColour":  "&H00FFFFFF",
        "SecondaryColour":"&H00AAAAAA",
        "OutlineColour":  "&H00000000",
        "BackColour":     "&H00000000",
        "Bold": 1, "BorderStyle": 1, "Outline": 3, "Shadow": 0,
    },
    "classic": {
        "PrimaryColour":  "&H00FFFFFF",
        "SecondaryColour":"&H00FFFFFF",
        "OutlineColour":  "&H00000000",
        "BackColour":     "&H00000000",
        "Bold": 0, "BorderStyle": 1, "Outline": 2, "Shadow": 1,
    },
    "outline": {
        "PrimaryColour":  "&H00FFFFFF",
        "SecondaryColour":"&H00888888",
        "OutlineColour":  "&H00000000",
        "BackColour":     "&H00000000",
        "Bold": 1, "BorderStyle": 1, "Outline": 5, "Shadow": 0,
    },
    "glow": {
        "PrimaryColour":  "&H0064FFFF",
        "SecondaryColour":"&H00DDDDDD",
        "OutlineColour":  "&H00000000",
        "BackColour":     "&H00000000",
        "Bold": 1, "BorderStyle": 1, "Outline": 2, "Shadow": 5,
    },
    "minimal": {
        "PrimaryColour":  "&H00FFFFFF",
        "SecondaryColour":"&H55FFFFFF",
        "OutlineColour":  "&H00000000",
        "BackColour":     "&H00000000",
        "Bold": 0, "BorderStyle": 1, "Outline": 1, "Shadow": 0,
    },
    "neon": {
        "PrimaryColour":  "&H0000FF00",
        "SecondaryColour":"&H00444444",
        "OutlineColour":  "&H0000AA00",
        "BackColour":     "&H00000000",
        "Bold": 1, "BorderStyle": 1, "Outline": 3, "Shadow": 8,
    },
    "gradient": {
        "PrimaryColour":  "&H00FF88FF",
        "SecondaryColour":"&H00FFAA44",
        "OutlineColour":  "&H00000000",
        "BackColour":     "&H00000000",
        "Bold": 1, "BorderStyle": 1, "Outline": 3, "Shadow": 2,
    },
    "karaoke": {
        "PrimaryColour":  "&H0039E508",   # bright green highlight
        "SecondaryColour":"&H00FFFFFF",
        "OutlineColour":  "&H00000000",
        "BackColour":     "&H00000000",
        "Bold": 1, "BorderStyle": 1, "Outline": 4, "Shadow": 0,
    },
    "box": {
        "PrimaryColour":  "&H00FFFFFF",
        "SecondaryColour":"&H00AAAAAA",
        "OutlineColour":  "&H00000000",
        "BackColour":     "&H99000000",
        "Bold": 1, "BorderStyle": 3, "Outline": 10, "Shadow": 6,
    },

    # ── Instagram-style presets (uppercase, large, impact look) ───────────
    # "impacto": white bold UPPERCASE with thick black outline — plain style
    # (matches screenshot 2: "DE TODA ESTA" style)
    "impacto": {
        "PrimaryColour":  "&H00FFFFFF",
        "SecondaryColour":"&H00DDDDDD",
        "OutlineColour":  "&H00000000",
        "BackColour":     "&H00000000",
        "Bold": 1, "BorderStyle": 1, "Outline": 5, "Shadow": 2,
        "_uppercase": True,
        "_font_scale": 1.1,
    },
    # "rosa": white bold UPPERCASE on dark-rose rounded box — emphasis style
    # Box color: #8B2060 dark rose/burgundy → ASS BGR: B=0x60,G=0x20,R=0x8B → &H0060208B
    "rosa": {
        "PrimaryColour":  "&H00FFFFFF",
        "SecondaryColour":"&H00FFFFFF",
        "OutlineColour":  "&H0060208B",
        "BackColour":     "&H0060208B",
        "Bold": 1, "BorderStyle": 3,
        "Outline": 12, "Shadow": 6,
        "_uppercase": True,
        "_font_scale": 1.1,
    },
    # "impacto_rosa": karaoke hybrid — most words in white UPPERCASE (impacto style),
    # active word highlighted in Instagram pink (#E1306C → ASS BGR &H006C30E1).
    # DEFAULT preset for all new videos.
    "impacto_rosa": {
        "PrimaryColour":  "&H006C30E1",   # Instagram pink — active/highlighted word
        "SecondaryColour":"&H00FFFFFF",   # white — words not yet reached
        "OutlineColour":  "&H00000000",   # black outline
        "BackColour":     "&H00000000",
        "Bold": 1, "BorderStyle": 1, "Outline": 5, "Shadow": 2,
        "_uppercase": True,
        "_font_scale": 1.1,
    },
}

# Extract custom processing flags (not valid ASS fields) before building header
st = dict(PRESET_STYLES.get(PRESET, PRESET_STYLES["bold"]))
UPPERCASE_TEXT = st.pop("_uppercase", False)
FONT_SCALE     = st.pop("_font_scale", 1.0)
FONT_SIZE      = int(FONT_SIZE * FONT_SCALE)

# Detect font available on system.
# We store (file_path, font_family_name) pairs — libass needs the FAMILY name
# (e.g. "DejaVu Sans"), not the filename (e.g. "DejaVuSans-Bold").
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
font_candidates = [
    (os.path.join(SCRIPT_DIR, "fonts", "Inter-Bold.ttf"),                    "Inter"),
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",                  "DejaVu Sans"),
    ("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",          "Liberation Sans"),
    ("/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",                              "DejaVu Sans"),
    ("/System/Library/Fonts/Supplemental/Arial Bold.ttf",                     "Arial"),
    ("/Library/Fonts/Arial Bold.ttf",                                         "Arial"),
]
font_name = "DejaVu Sans"  # safe default: installed by Dockerfile's fonts-dejavu-core
font_file  = None
for fp, family in font_candidates:
    if os.path.exists(fp):
        font_name = family
        font_file  = fp
        break

# Determine a fonts directory to pass to libass via the fontsdir= filter option.
# This lets libass find fonts WITHOUT doing a full fontconfig scan (which can hang
# in headless containers when the fontconfig cache is absent or stale).
fonts_search_dirs = [
    os.path.dirname(font_file) if font_file else None,
    os.path.join(SCRIPT_DIR, "fonts"),
    "/usr/share/fonts/truetype/dejavu",
    "/usr/share/fonts/truetype/liberation",
    "/usr/share/fonts/truetype",
    "/usr/share/fonts",
    "/Library/Fonts",
]
fontsdir = ""
for d in fonts_search_dirs:
    if d and os.path.isdir(d):
        # Verify the directory actually has font files
        try:
            if any(f.endswith((".ttf", ".otf", ".TTF", ".OTF")) for f in os.listdir(d)):
                fontsdir = d
                break
        except OSError:
            pass

print(f"[subtitles] font={font_name!r}  fontsdir={fontsdir!r}", file=sys.stderr)

# ── Build ASS file ────────────────────────────────────────────────────────────

ass_header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {vid_width}
PlayResY: {vid_height}
ScaledBorderAndShadow: yes
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{font_name},{FONT_SIZE},{st['PrimaryColour']},{st['SecondaryColour']},{st['OutlineColour']},{st['BackColour']},{st['Bold']},0,0,0,100,100,0,0,{st['BorderStyle']},{st['Outline']},{st['Shadow']},2,10,10,{int(vid_height * 0.35)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

dialogue_lines = []
for p in phrases:
    # Shift timings: subtract clip start, apply offset
    start_ms = p["startMs"] - CLIP_START_MS + OFFSET_MS
    end_ms   = p["endMs"]   - CLIP_START_MS + OFFSET_MS

    if start_ms < 0 and end_ms < 0:
        continue

    start_str = ms_to_ass(max(0, start_ms))
    end_str   = ms_to_ass(max(0, end_ms))

    # Build karaoke text with \k tags (centiseconds per word)
    text_parts = []
    for w in p["words"]:
        dur_cs = max(1, int((w["endMs"] - w["startMs"]) / 10))
        # Escape special ASS characters
        word_text = w["text"].replace("\\", "").replace("{", "").replace("}", "")
        if UPPERCASE_TEXT:
            word_text = word_text.upper()
        text_parts.append(f"{{\\k{dur_cs}}}{word_text}")
    text = " ".join(text_parts)

    dialogue_lines.append(
        f"Dialogue: 0,{start_str},{end_str},Default,,0,0,0,,{text}"
    )

ass_content = ass_header + "\n".join(dialogue_lines) + "\n"

# ── Run ffmpeg with ASS filter ────────────────────────────────────────────────

tmp_dir = tempfile.mkdtemp()
ass_path = os.path.join(tmp_dir, "subtitles.ass")
tmp_out  = os.path.join(tmp_dir, "output.mp4")

with open(ass_path, "w", encoding="utf-8") as f:
    f.write(ass_content)

# Escape the ASS path for ffmpeg filter (colons and backslashes need escaping)
def esc(s: str) -> str:
    return s.replace("\\", "/").replace(":", "\\:").replace(",", "\\,")

escaped_ass = esc(ass_path)

# Add fontsdir= to tell libass exactly where fonts are, bypassing a full
# fontconfig scan. fontconfig scanning an empty/uncached dir is a common
# cause of ffmpeg hanging indefinitely inside headless Docker containers.
fontsdir_opt = f":fontsdir={esc(fontsdir)}" if fontsdir else ""
vf_arg = f"ass={escaped_ass}{fontsdir_opt}"

cmd = [
    FFMPEG, "-y",
    "-i", CLIP_PATH,
    "-vf", vf_arg,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
    "-c:a", "copy",
    "-pix_fmt", "yuv420p",
    tmp_out,
]

print(f"[subtitles] Running ffmpeg ASS filter...", file=sys.stderr)
sys.stderr.flush()

# Use communicate() — it drains stdout+stderr into memory and returns only when
# the process exits.  This is the ONLY safe way to read subprocess output when:
#  1. The subprocess writes to stderr using \\r (no \\n), which confuses line readers
#  2. The caller (Node.js) may buffer our stderr pipe, causing a cascading deadlock
#     if we try to forward every ffmpeg frame line synchronously.
FFMPEG_TIMEOUT = 5 * 60  # 5 minutes — hard kill if ffmpeg hangs (e.g. libass/fontconfig)

proc = subprocess.Popen(
    cmd,
    stdout=subprocess.DEVNULL,
    stderr=subprocess.PIPE,
    env={**os.environ},
)

stderr_bytes = b""
try:
    _, stderr_bytes = proc.communicate(timeout=FFMPEG_TIMEOUT)
except subprocess.TimeoutExpired:
    proc.kill()
    _, stderr_bytes = proc.communicate()
    print(f"[subtitles] ERROR: ffmpeg timed out after {FFMPEG_TIMEOUT}s — killed", file=sys.stderr)
    print("[subtitles] Tip: libass/fontconfig may be hanging (no fonts installed or bad font cache)",
          file=sys.stderr)
    shutil.rmtree(tmp_dir, ignore_errors=True)
    sys.exit(1)

if proc.returncode != 0:
    # Forward the ffmpeg error log so Railway surfaces it
    err_text = (stderr_bytes or b"").decode("utf-8", errors="replace")
    # Only print the last 40 lines — ffmpeg error is always at the end
    tail = "\n".join(err_text.replace("\r", "\n").splitlines()[-40:])
    print(tail, file=sys.stderr)
    print(f"[subtitles] ffmpeg failed (code {proc.returncode})", file=sys.stderr)
    shutil.rmtree(tmp_dir, ignore_errors=True)
    sys.exit(1)

# Success — print key timing line so Node can log it
if stderr_bytes:
    for line in (stderr_bytes.decode("utf-8", errors="replace")
                 .replace("\r", "\n").splitlines()):
        if "time=" in line and "speed=" in line:
            print(f"[subtitles] {line.strip()}", file=sys.stderr)
            break

shutil.move(tmp_out, CLIP_PATH)
shutil.rmtree(tmp_dir, ignore_errors=True)
print(f"[subtitles] Done → {os.path.basename(CLIP_PATH)}", file=sys.stderr)
