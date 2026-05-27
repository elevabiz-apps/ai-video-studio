#!/bin/sh
# Start script for Railway deployment with persistent Volume at /app/data
# Creates symlinks so Next.js serves files from the volume through public/
set -ex  # Exit on error, print commands

echo "========================================="
echo "[start] INITIALIZING RAILWAY DEPLOYMENT"
echo "========================================="

# Check working directory
echo "[start] Current directory: $(pwd)"
echo "[start] Directory contents:"
ls -la

# Check environment
DATA_DIR="${DATA_DIR:-/app/data}"
echo "[start] DATA_DIR=$DATA_DIR"
echo "[start] NODE_ENV=$NODE_ENV"
echo "[start] HOSTNAME=$HOSTNAME"
echo "[start] PORT=$PORT"
echo "[start] NODE_VERSION: $(node --version)"
echo "[start] NPM_VERSION: $(npm --version)"

echo ""
echo "[start] Setting up persistent storage at $DATA_DIR..."
mkdir -p "$DATA_DIR/assets" "$DATA_DIR/renders" "$DATA_DIR/db"
echo "[start] ✓ Created directories in $DATA_DIR"

# Check if directories were created
ls -la "$DATA_DIR"

# Symlink public/ subdirs to volume so Next.js serves them as static files
# and existing code that writes to public/assets/ transparently uses the volume
echo ""
echo "[start] Setting up symlinks..."
if [ ! -L /app/public/assets ]; then
  echo "[start] Removing /app/public/assets (if exists)..."
  rm -rf /app/public/assets
  echo "[start] Creating symlink: /app/public/assets → $DATA_DIR/assets"
  ln -s "$DATA_DIR/assets" /app/public/assets
  echo "[start] ✓ Linked public/assets → $DATA_DIR/assets"
else
  echo "[start] ✓ /app/public/assets already symlinked"
fi

if [ ! -L /app/public/renders ]; then
  echo "[start] Removing /app/public/renders (if exists)..."
  rm -rf /app/public/renders
  echo "[start] Creating symlink: /app/public/renders → $DATA_DIR/renders"
  ln -s "$DATA_DIR/renders" /app/public/renders
  echo "[start] ✓ Linked public/renders → $DATA_DIR/renders"
else
  echo "[start] ✓ /app/public/renders already symlinked"
fi

# Verify symlinks
echo "[start] Verifying symlinks..."
ls -la /app/public/assets
ls -la /app/public/renders

# Check if server.js exists
echo ""
echo "[start] Checking for server.js..."
if [ ! -f /app/server.js ]; then
  echo "[ERROR] server.js not found at /app/server.js"
  echo "[ERROR] Directory contents of /app:"
  ls -la /app/
  exit 1
fi
echo "[start] ✓ server.js found"

echo ""
echo "========================================="
echo "[start] Starting Next.js server..."
echo "========================================="
exec node server.js
