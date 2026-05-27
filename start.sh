#!/bin/sh
# Start script for Railway deployment with persistent Volume at /app/data
# Creates symlinks so Next.js serves files from the volume through public/

# Ensure output is not buffered so logs appear in real-time
export PYTHONUNBUFFERED=1

# Error handler - logs and exits
handle_error() {
  echo "[ERROR] $1" >&2
  exit 1
}

echo "========================================="
echo "[start] INITIALIZING RAILWAY DEPLOYMENT"
echo "========================================="

# Check working directory
echo "[start] Current directory: $(pwd)"
echo "[start] Directory contents:"
ls -la || handle_error "Failed to list directory contents"

# Check environment
DATA_DIR="${DATA_DIR:-/app/data}"
echo "[start] DATA_DIR=$DATA_DIR"
echo "[start] NODE_ENV=$NODE_ENV"
echo "[start] HOSTNAME=$HOSTNAME"
echo "[start] PORT=$PORT"

# Check if node and npm are available
if command -v node > /dev/null 2>&1; then
  echo "[start] NODE_VERSION: $(node --version)"
else
  handle_error "Node.js is not installed or not in PATH"
fi

if command -v npm > /dev/null 2>&1; then
  echo "[start] NPM_VERSION: $(npm --version)"
else
  echo "[start] WARNING: npm not found in PATH"
fi

echo ""
echo "[start] Setting up persistent storage at $DATA_DIR..."
mkdir -p "$DATA_DIR/assets" "$DATA_DIR/renders" "$DATA_DIR/db" || handle_error "Failed to create directories"
echo "[start] ✓ Created directories in $DATA_DIR"

# Check if directories were created
ls -la "$DATA_DIR" || handle_error "Failed to list created directories"

# Symlink public/ subdirs to volume so Next.js serves them as static files
# and existing code that writes to public/assets/ transparently uses the volume
echo ""
echo "[start] Setting up symlinks..."
if [ ! -L /app/public/assets ]; then
  echo "[start] Removing /app/public/assets (if exists)..."
  rm -rf /app/public/assets || handle_error "Failed to remove /app/public/assets"
  echo "[start] Creating symlink: /app/public/assets → $DATA_DIR/assets"
  ln -s "$DATA_DIR/assets" /app/public/assets || handle_error "Failed to create symlink for assets"
  echo "[start] ✓ Linked public/assets → $DATA_DIR/assets"
else
  echo "[start] ✓ /app/public/assets already symlinked"
fi

if [ ! -L /app/public/renders ]; then
  echo "[start] Removing /app/public/renders (if exists)..."
  rm -rf /app/public/renders || handle_error "Failed to remove /app/public/renders"
  echo "[start] Creating symlink: /app/public/renders → $DATA_DIR/renders"
  ln -s "$DATA_DIR/renders" /app/public/renders || handle_error "Failed to create symlink for renders"
  echo "[start] ✓ Linked public/renders → $DATA_DIR/renders"
else
  echo "[start] ✓ /app/public/renders already symlinked"
fi

# Verify symlinks
echo "[start] Verifying symlinks..."
ls -la /app/public/assets || handle_error "Failed to verify assets symlink"
ls -la /app/public/renders || handle_error "Failed to verify renders symlink"

# Check if server.js exists
echo ""
echo "[start] Checking for server.js..."
if [ ! -f /app/server.js ]; then
  echo "[ERROR] server.js not found at /app/server.js"
  echo "[ERROR] Directory contents of /app:"
  ls -la /app/
  handle_error "server.js not found"
fi
echo "[start] ✓ server.js found ($(wc -c < /app/server.js) bytes)"

# Check if node_modules exists
if [ ! -d /app/node_modules ]; then
  echo "[ERROR] node_modules not found at /app/node_modules"
  handle_error "node_modules directory not found"
fi
echo "[start] ✓ node_modules directory found"

echo ""
echo "========================================="
echo "[start] Starting Next.js server..."
echo "========================================="
exec node server.js
