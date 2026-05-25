#!/bin/bash
# Batch Render + Upload
# Renders a composition for multiple platforms and uploads each to its platform.
#
# Usage:
#   ./scripts/batch-render-upload.sh <composition-id> <platforms...> [--metadata upload-metadata.json]
#   ./scripts/batch-render-upload.sh DuelosEdit tiktok youtube_short instagram_reel --metadata upload-metadata.json
#   ./scripts/batch-render-upload.sh DuelosEdit youtube_short --title "Mi Video" --privacy unlisted

set -e

# Parse composition and platforms (before --)
COMP_ID=""
PLATFORMS=()
UPLOAD_ARGS=()
PARSING_PLATFORMS=true

for arg in "$@"; do
  if [[ "$arg" == --* ]]; then
    PARSING_PLATFORMS=false
  fi

  if $PARSING_PLATFORMS; then
    if [ -z "$COMP_ID" ]; then
      COMP_ID="$arg"
    else
      PLATFORMS+=("$arg")
    fi
  else
    UPLOAD_ARGS+=("$arg")
  fi
done

if [ -z "$COMP_ID" ] || [ ${#PLATFORMS[@]} -eq 0 ]; then
  echo "Usage: ./scripts/batch-render-upload.sh <composition-id> <platforms...> [--title \"...\"] [--metadata file.json]"
  echo ""
  echo "Examples:"
  echo "  ./scripts/batch-render-upload.sh DuelosEdit youtube_short --title \"My Video\" --privacy unlisted"
  echo "  ./scripts/batch-render-upload.sh DuelosEdit tiktok youtube_short --metadata upload-metadata.json"
  exit 1
fi

TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "=== Batch Render + Upload: ${COMP_ID} ==="
echo "Platforms: ${PLATFORMS[*]}"
echo ""

# Step 1: Render all platforms
echo "--- Step 1: Rendering ---"
./scripts/batch-render.sh "$COMP_ID" "${PLATFORMS[@]}"

echo ""
echo "--- Step 2: Uploading ---"

# Step 2: Upload each rendered file
for PLATFORM in "${PLATFORMS[@]}"; do
  # Find the most recently rendered file for this platform
  OUTPUT_FILE=$(ls -t out/${COMP_ID}_${PLATFORM}_*.mp4 2>/dev/null | head -1)

  if [ -z "$OUTPUT_FILE" ]; then
    echo "Warning: No rendered file found for ${PLATFORM}, skipping upload."
    continue
  fi

  echo ""
  echo "Uploading: ${OUTPUT_FILE}"
  npx tsx scripts/upload.ts "$OUTPUT_FILE" "${UPLOAD_ARGS[@]}" || {
    echo "Warning: Upload failed for ${PLATFORM}, continuing..."
  }
done

echo ""
echo "=== Batch render + upload complete ==="
