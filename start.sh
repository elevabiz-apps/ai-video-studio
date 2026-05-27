#!/bin/sh
# Backup start script - used if Dockerfile CMD fails
# This script is primarily for local testing; the Dockerfile uses an inline wrapper for production

echo "[start] Railway Deployment Script"
DATA_DIR="${DATA_DIR:-/app/data}"
echo "[start] DATA_DIR=$DATA_DIR"

mkdir -p "$DATA_DIR/assets" "$DATA_DIR/renders" "$DATA_DIR/db"
rm -rf /app/public/assets /app/public/renders
ln -s "$DATA_DIR/assets" /app/public/assets
ln -s "$DATA_DIR/renders" /app/public/renders

exec node /app/server.js
