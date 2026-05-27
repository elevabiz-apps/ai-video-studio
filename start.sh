#!/bin/sh
# Start script for Railway deployment with persistent Volume at /app/data
# Creates symlinks so Next.js serves files from the volume through public/

echo "[start] INIT: Starting application startup script"

# Minimal setup - just create directories and symlinks, then start the server
DATA_DIR="${DATA_DIR:-/app/data}"

echo "[start] Creating data directories at $DATA_DIR..."
mkdir -p "$DATA_DIR/assets" "$DATA_DIR/renders" "$DATA_DIR/db"
echo "[start] OK: Data directories created"

echo "[start] Setting up symlinks..."
rm -rf /app/public/assets
ln -s "$DATA_DIR/assets" /app/public/assets
echo "[start] OK: Created symlink for assets"

rm -rf /app/public/renders
ln -s "$DATA_DIR/renders" /app/public/renders
echo "[start] OK: Created symlink for renders"

echo "[start] Verifying server.js exists..."
if [ ! -f /app/server.js ]; then
  echo "[start] ERROR: server.js not found!"
  ls -la /app/
  exit 1
fi
echo "[start] OK: server.js found"

echo "[start] Environment variables:"
echo "  NODE_ENV=$NODE_ENV"
echo "  HOSTNAME=$HOSTNAME"
echo "  PORT=$PORT"
echo "  PWD=$(pwd)"

echo "[start] STARTUP: Executing Node.js server"
exec node server.js
