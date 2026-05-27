#!/usr/bin/env python3
"""
Cut silences longer than a threshold from a video file.
Usage: python3 cut_silences.py <input> <output> [threshold_db] [min_silence_duration]
"""

import subprocess
import sys
import re
import os
import tempfile

# Use FFMPEG_PATH env var if set (e.g. Railway/Linux: /usr/bin/ffmpeg)
# Falls back to the Remotion-bundled binary for local macOS dev
_default_ffmpeg = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../node_modules/@remotion/compositor-darwin-arm64/ffmpeg")
)
FFMPEG = os.environ.get("FFMPEG_PATH", _default_ffmpeg)
FFPROBE = os.environ.get("FFPROBE_PATH", FFMPEG.replace("/ffmpeg", "/ffprobe").replace("ffmpeg", "ffprobe"))
_compositor_dir = os.path.dirname(FFMPEG)
DYLD_ENV = {**os.environ, "DYLD_LIBRARY_PATH": _compositor_dir}

def get_duration(input_file):
    result = subprocess.run(
        [FFPROBE, "-v", "quiet", "-print_format", "json", "-show_format", input_file],
        capture_output=True, text=True, env=DYLD_ENV
    )
    import json
    data = json.loads(result.stdout)
    return float(data["format"]["duration"])

def detect_silences(input_file, noise_db="-40dB", min_duration=0.8):
    result = subprocess.run(
        [FFMPEG, "-i", input_file, "-map", "0:1",
         "-af", f"silencedetect=noise={noise_db}:d={min_duration}",
         "-f", "null", "-"],
        capture_output=True, text=True, env=DYLD_ENV
    )
    output = result.stderr
    silences = []
    starts = re.findall(r"silence_start: ([0-9.]+)", output)
    ends = re.findall(r"silence_end: ([0-9.]+)", output)
    for s, e in zip(starts, ends):
        silences.append((float(s), float(e)))
    # Handle case where video ends in silence (no matching end)
    if len(starts) > len(ends):
        silences.append((float(starts[-1]), None))
    return silences

END_PROTECTION_SEC = 2.0  # never cut anything in the last N seconds of the video

def build_keep_segments(silences, duration, padding=0.15):
    """Build list of (start, end) segments to keep.

    Changes vs original:
    - padding increased 0.1→0.15s for more natural cuts
    - cursor never goes backwards (prevents audio overlap/repetition when
      two consecutive silences are very close together)
    - END_PROTECTION_SEC: silences that start in the last N seconds are
      skipped so the final sentence never gets chopped off
    """
    segments = []
    cursor = 0.0

    for sil_start, sil_end in silences:
        # Skip silences that start in the end-protection zone
        if sil_start >= duration - END_PROTECTION_SEC:
            break

        # End of keep segment at the start of the silence (+ small tail padding)
        keep_end = sil_start + padding
        if keep_end > cursor + 0.05:  # only add if segment has meaningful length
            segments.append((cursor, keep_end))

        # Next keep starts just before silence ends (- small lead-in padding)
        # max(keep_end, ...) ensures cursor never goes backwards → no overlapping segments
        if sil_end is None:
            cursor = duration
        else:
            cursor = max(keep_end, sil_end - padding)

    # Always add final segment up to the true end of the video
    if cursor < duration - 0.05:
        segments.append((cursor, duration))

    return segments

def cut_segment(args):
    """Cut a single segment using stream copy — fast, minimal RAM, no re-encoding.

    IMPORTANT: -ss is placed AFTER -i (output-side seeking).
    Placing -ss BEFORE -i (input seeking) makes FFmpeg snap to the nearest
    keyframe *before* the requested time, so each segment clip silently
    contains extra frames from before the cut point. When segments are
    concatenated those extra frames create a brief audio repeat/echo.
    Output-side seeking decodes to the exact frame, so segments start
    precisely where requested — no overlap, no repetition.
    """
    i, start, end, input_file, tmpdir = args
    clip_path = os.path.join(tmpdir, f"clip_{i:04d}.mp4")
    duration = end - start
    cmd = [
        FFMPEG, "-y",
        "-i", input_file,
        "-ss", str(start),   # ← after -i: accurate output-side seek, no keyframe snap
        "-t", str(duration),
        "-map", "0:v:0", "-map", "0:a:0",
        "-c", "copy",
        "-avoid_negative_ts", "make_zero",
        clip_path
    ]
    subprocess.run(cmd, capture_output=True, env=DYLD_ENV, check=True)
    return clip_path

def cut_and_concat(input_file, segments, output_file):
    with tempfile.TemporaryDirectory() as tmpdir:
        print(f"Cutting {len(segments)} segments (stream copy, low memory)...")

        # Sequential cutting — stream copy is fast so no need for parallelism,
        # and parallel ffmpeg processes OOM-kill on Railway's 512MB containers.
        clip_files = []
        for i, (s, e) in enumerate(segments):
            clip_path = cut_segment((i, s, e, input_file, tmpdir))
            clip_files.append(clip_path)
            print(f"  [{i+1}/{len(segments)}] {s:.2f}s → {e:.2f}s")

        concat_file = os.path.join(tmpdir, "concat.txt")
        with open(concat_file, "w") as f:
            for clip in clip_files:
                f.write(f"file '{clip}'\n")

        print(f"\nConcatenating {len(clip_files)} clips → {output_file}")
        cmd = [
            FFMPEG, "-y",
            "-f", "concat", "-safe", "0",
            "-i", concat_file,
            "-c", "copy",
            output_file
        ]
        subprocess.run(cmd, capture_output=True, env=DYLD_ENV, check=True)

def main():
    input_file = sys.argv[1] if len(sys.argv) > 1 else None
    output_file = sys.argv[2] if len(sys.argv) > 2 else None
    noise_db = sys.argv[3] if len(sys.argv) > 3 else "-40dB"
    min_silence = float(sys.argv[4]) if len(sys.argv) > 4 else 0.8

    if not input_file or not output_file:
        print("Usage: python3 cut_silences.py <input> <output> [noise_db] [min_silence_sec]")
        sys.exit(1)

    print(f"Input:  {input_file}")
    print(f"Output: {output_file}")
    print(f"Detecting silences (threshold={noise_db}, min_duration={min_silence}s)...")

    duration = get_duration(input_file)
    print(f"Duration: {duration:.2f}s")

    silences = detect_silences(input_file, noise_db, min_silence)
    print(f"Found {len(silences)} silence(s)")

    segments = build_keep_segments(silences, duration)
    total_kept = sum(e - s for s, e in segments)
    print(f"Keeping {len(segments)} segments ({total_kept:.1f}s / {duration:.1f}s, removed {duration - total_kept:.1f}s)\n")

    cut_and_concat(input_file, segments, output_file)
    print(f"\nDone! Output saved to: {output_file}")

if __name__ == "__main__":
    main()
