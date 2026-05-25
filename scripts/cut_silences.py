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

FFMPEG = os.path.join(os.path.dirname(__file__), "../node_modules/@remotion/compositor-darwin-arm64/ffmpeg")
FFMPEG = os.path.abspath(FFMPEG)
FFPROBE = FFMPEG.replace("/ffmpeg", "/ffprobe")
DYLD_ENV = {**os.environ, "DYLD_LIBRARY_PATH": os.path.dirname(FFMPEG)}

def get_duration(input_file):
    result = subprocess.run(
        [FFPROBE, "-v", "quiet", "-print_format", "json", "-show_format", input_file],
        capture_output=True, text=True, env=DYLD_ENV
    )
    import json
    data = json.loads(result.stdout)
    return float(data["format"]["duration"])

def detect_silences(input_file, noise_db="-30dB", min_duration=0.5):
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

def build_keep_segments(silences, duration, padding=0.1):
    """Build list of (start, end) segments to keep."""
    segments = []
    cursor = 0.0

    for sil_start, sil_end in silences:
        # End of keep segment: silence start (minus small padding)
        keep_end = max(cursor, sil_start + padding)
        if keep_end > cursor + 0.05:  # only add if segment has meaningful length
            segments.append((cursor, keep_end))
        # Next keep starts after silence end (plus small padding)
        if sil_end is None:
            cursor = duration
        else:
            cursor = max(cursor, sil_end - padding)

    # Add final segment if there's content after last silence
    if cursor < duration - 0.05:
        segments.append((cursor, duration))

    return segments

def cut_segment(args):
    """Cut a single segment with re-encode for frame-accurate cuts (no word truncation)."""
    i, start, end, input_file, tmpdir = args
    clip_path = os.path.join(tmpdir, f"clip_{i:04d}.mp4")
    duration = end - start
    cmd = [
        FFMPEG, "-y",
        "-ss", str(start),
        "-i", input_file,
        "-t", str(duration),
        "-map", "0:v:0", "-map", "0:a:0",
        # Re-encode for frame-accurate cuts — avoids keyframe snapping and word truncation
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
        "-c:a", "aac", "-b:a", "128k",
        "-avoid_negative_ts", "make_zero",
        clip_path
    ]
    subprocess.run(cmd, capture_output=True, env=DYLD_ENV, check=True)
    return clip_path

def cut_and_concat(input_file, segments, output_file):
    from concurrent.futures import ThreadPoolExecutor, as_completed
    import multiprocessing

    with tempfile.TemporaryDirectory() as tmpdir:
        print(f"Cutting {len(segments)} segments (re-encode, frame-accurate)...")

        # Parallel segment cutting — use up to 4 workers (re-encode is CPU-heavy)
        workers = min(4, multiprocessing.cpu_count(), len(segments))
        args = [(i, s, e, input_file, tmpdir) for i, (s, e) in enumerate(segments)]
        clip_files = [None] * len(segments)

        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = {executor.submit(cut_segment, a): a[0] for a in args}
            for future in as_completed(futures):
                i = futures[future]
                clip_files[i] = future.result()
                print(f"  [{i+1}/{len(segments)}] {segments[i][0]:.2f}s → {segments[i][1]:.2f}s")

        concat_file = os.path.join(tmpdir, "concat.txt")
        with open(concat_file, "w") as f:
            for clip in clip_files:
                f.write(f"file '{clip}'\n")

        print(f"\nConcatenating {len(clip_files)} clips → {output_file}")
        cmd = [
            FFMPEG, "-y",
            "-f", "concat", "-safe", "0",
            "-i", concat_file,
            # Stream copy for concat — clips are already encoded, just join them
            "-c", "copy",
            output_file
        ]
        subprocess.run(cmd, capture_output=True, env=DYLD_ENV, check=True)

def main():
    input_file = sys.argv[1] if len(sys.argv) > 1 else None
    output_file = sys.argv[2] if len(sys.argv) > 2 else None
    noise_db = sys.argv[3] if len(sys.argv) > 3 else "-30dB"
    min_silence = float(sys.argv[4]) if len(sys.argv) > 4 else 0.5

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
