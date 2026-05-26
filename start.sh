#!/bin/sh
# Start script for Railway deployment with persistent Volume at /app/data
# Creates symlinks so Next.js serves files from the volume through public/

DATA_DIR="${DATA_DIR:-/app/data}"

echo "[start] Setting up persistent storage at $DATA_DIR"
mkdir -p "$DATA_DIR/assets" "$DATA_DIR/renders" "$DATA_DIR/db"

# Symlink public/ subdirs to volume so Next.js serves them as static files
# and existing code that writes to public/assets/ transparently uses the volume
if [ ! -L /app/public/assets ]; then
  rm -rf /app/public/assets
  ln -s "$DATA_DIR/assets" /app/public/assets
  echo "[start] Linked public/assets → $DATA_DIR/assets"
fi

if [ ! -L /app/public/renders ]; then
  rm -rf /app/public/renders
  ln -s "$DATA_DIR/renders" /app/public/renders
  echo "[start] Linked public/renders → $DATA_DIR/renders"
fi

echo "[start] Starting Next.js server..."
exec node server.js
