#!/usr/bin/env python3
"""
Detect the dominant face position in a horizontal video and compute
the optimal crop X offset for a vertical (9:16) reframe.

Usage:
  python3 scripts/detect-face-center.py <video_path> <ffmpeg_path>

Output (stdout):
  JSON: { "crop_x": <int>, "crop_w": <int>, "video_w": <int>, "video_h": <int>, "face_found": <bool> }

Exit 0 on success, 1 on hard error.
"""

import sys
import json
import os
import subprocess
import tempfile
import shutil

# ── mediapipe ──────────────────────────────────────────────────────────────────
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision
import urllib.request

# ── Args ───────────────────────────────────────────────────────────────────────
if len(sys.argv) < 3:
    print("Usage: detect-face-center.py <video_path> <ffmpeg_path> [compositor_dir]", file=sys.stderr)
    sys.exit(1)

VIDEO_PATH      = sys.argv[1]
FFMPEG          = sys.argv[2]
COMPOSITOR_DIR  = sys.argv[3] if len(sys.argv) > 3 else os.path.dirname(FFMPEG)

# Inject DYLD_LIBRARY_PATH so Remotion's ffmpeg/ffprobe can find shared libs
os.environ["DYLD_LIBRARY_PATH"] = COMPOSITOR_DIR
N_FRAMES   = 12   # frames to sample
MIN_CONF   = 0.5  # minimum face detection confidence

# ── Download mediapipe face detector model if needed ──────────────────────────
MODEL_DIR  = os.path.join(os.path.dirname(__file__), "..", ".cache", "mediapipe")
MODEL_PATH = os.path.join(MODEL_DIR, "blaze_face_short_range.tflite")

if not os.path.exists(MODEL_PATH):
    os.makedirs(MODEL_DIR, exist_ok=True)
    url = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite"
    print(f"Descargando modelo de detección facial...", file=sys.stderr)
    ret = os.system(f'curl -L -s -o "{MODEL_PATH}" "{url}"')
    if ret != 0 or not os.path.exists(MODEL_PATH):
        print("Error: no se pudo descargar el modelo. Ejecutá manualmente:", file=sys.stderr)
        print(f'  curl -L -o "{MODEL_PATH}" "{url}"', file=sys.stderr)
        sys.exit(1)
    print(f"Modelo guardado en {MODEL_PATH}", file=sys.stderr)

# ── Get video duration via ffprobe ────────────────────────────────────────────
def get_duration(video_path, ffmpeg_path):
    # Derive ffprobe from ffmpeg path (same directory)
    ffprobe = os.path.join(os.path.dirname(os.path.abspath(ffmpeg_path)), "ffprobe")
    if not os.path.exists(ffprobe):
        ffprobe = "ffprobe"  # fall back to system ffprobe

    cmd = [ffprobe, "-v", "quiet", "-print_format", "json",
           "-show_format", "-show_streams", os.path.abspath(video_path)]
    result = subprocess.run(cmd, capture_output=True, text=True)

    if not result.stdout.strip():
        print(f"ffprobe stderr: {result.stderr[:200]}", file=sys.stderr)
        raise RuntimeError("ffprobe devolvió output vacío")

    data = json.loads(result.stdout)
    duration = float(data.get("format", {}).get("duration", 0))
    video_stream = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), {})
    width  = int(video_stream.get("width", 0))
    height = int(video_stream.get("height", 0))
    return duration, width, height

# ── Extract frames evenly distributed through the video ───────────────────────
def extract_frames(video_path, ffmpeg_path, duration, n, tmp_dir):
    paths = []
    ffmpeg_abs = os.path.abspath(ffmpeg_path)
    video_abs  = os.path.abspath(video_path)
    for i in range(n):
        t = duration * (i + 0.5) / n
        out = os.path.join(tmp_dir, f"frame_{i:03d}.jpg")
        cmd = [ffmpeg_abs, "-ss", f"{t:.3f}", "-i", video_abs,
               "-frames:v", "1", "-q:v", "2", "-y", out]
        subprocess.run(cmd, capture_output=True)
        if os.path.exists(out):
            paths.append(out)
    return paths

# ── Detect faces in one frame image, return list of bounding box centers ──────
def detect_faces_in_frame(image_path, detector):
    import mediapipe as mp
    mp_image = mp.Image.create_from_file(image_path)
    result = detector.detect(mp_image)
    centers = []
    for detection in result.detections:
        score = detection.categories[0].score if detection.categories else 0
        if score < MIN_CONF:
            continue
        bb = detection.bounding_box
        cx = bb.origin_x + bb.width / 2
        centers.append(cx)
    return centers

# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    duration, video_w, video_h = get_duration(VIDEO_PATH, FFMPEG)

    if video_w == 0 or video_h == 0:
        print("Error: no se pudo leer el video", file=sys.stderr)
        sys.exit(1)

    # Compute default center crop (fallback)
    crop_w     = int((video_h * 9 / 16) // 2 * 2)   # must be even
    default_cx = (video_w - crop_w) // 2             # centered
    crop_x     = default_cx

    tmp_dir = tempfile.mkdtemp()
    face_found = False

    try:
        frames = extract_frames(VIDEO_PATH, FFMPEG, duration, N_FRAMES, tmp_dir)

        if not frames:
            raise RuntimeError("No se pudieron extraer frames")

        # Build mediapipe face detector (new Tasks API)
        options = mp_vision.FaceDetectorOptions(
            base_options=mp_python.BaseOptions(model_asset_path=MODEL_PATH),
            running_mode=mp_vision.RunningMode.IMAGE,
            min_detection_confidence=MIN_CONF,
        )
        detector = mp_vision.FaceDetector.create_from_options(options)

        all_face_cx = []
        for frame_path in frames:
            centers = detect_faces_in_frame(frame_path, detector)
            all_face_cx.extend(centers)
            print(f"  {os.path.basename(frame_path)}: {len(centers)} cara(s) detectada(s)", file=sys.stderr)

        detector.close()

        if all_face_cx:
            face_found = True
            avg_face_cx = sum(all_face_cx) / len(all_face_cx)

            # Desired crop: center the window on the face
            ideal_crop_x = int(avg_face_cx - crop_w / 2)

            # Clamp so crop stays within frame bounds
            crop_x = max(0, min(ideal_crop_x, video_w - crop_w))
            print(f"  Cara detectada en x={avg_face_cx:.0f}px → crop_x={crop_x}", file=sys.stderr)
        else:
            print("  Sin caras detectadas → usando crop centrado", file=sys.stderr)

    except Exception as e:
        print(f"  Detección falló ({e}) → usando crop centrado", file=sys.stderr)

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

    result = {
        "crop_x":     crop_x,
        "crop_w":     crop_w,
        "video_w":    video_w,
        "video_h":    video_h,
        "face_found": face_found,
    }
    print(json.dumps(result))

main()
