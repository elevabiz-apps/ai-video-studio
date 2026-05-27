# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

# Install Python + system dependencies for cv2/PIL/ffmpeg
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-dev \
    ffmpeg \
    libgl1 libglib2.0-0 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python video processing libs
RUN pip3 install --no-cache-dir --break-system-packages \
    opencv-python-headless \
    Pillow \
    numpy

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Build the Next.js app (web studio only — not Remotion)
RUN npm run web:build

# ── Stage 2: Runtime ───────────────────────────────────────────────────────────
FROM node:22-slim AS runner

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip \
    ffmpeg \
    libgl1 libglib2.0-0 \
    # Fonts + fontconfig — required by ffmpeg's libass subtitle filter.
    # Without fonts, fontconfig hangs scanning an empty font directory.
    fontconfig \
    fonts-dejavu-core \
    && fc-cache -fv \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --no-cache-dir --break-system-packages \
    opencv-python-headless \
    Pillow \
    numpy

ENV NODE_ENV=production
# Bind to all interfaces so Railway's proxy can reach the server
ENV HOSTNAME=0.0.0.0
# Tell all scripts to use system ffmpeg instead of the Remotion macOS binary
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV FFPROBE_PATH=/usr/bin/ffprobe

# Copy standalone output FIRST, but clear any included node_modules to avoid conflicts
COPY --from=builder /app/.next/standalone ./
RUN rm -rf /app/node_modules  # Remove any node_modules from standalone output
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts

# Copy clean node_modules from builder (overwrite any from standalone)
COPY --from=builder /app/node_modules ./node_modules

COPY --from=builder /app/start.sh ./start.sh
RUN chmod +x start.sh

# Placeholder dirs (will be replaced by symlinks to volume on startup)
RUN mkdir -p public/assets public/renders

EXPOSE 3000

# Create a minimal startup wrapper that ensures Node.js can start
RUN cat > /app/run.sh << 'EOF'
#!/bin/sh
DATA_DIR="${DATA_DIR:-/app/data}"
mkdir -p "$DATA_DIR/assets" "$DATA_DIR/renders" "$DATA_DIR/db"
rm -rf /app/public/assets /app/public/renders
ln -s "$DATA_DIR/assets" /app/public/assets
ln -s "$DATA_DIR/renders" /app/public/renders
# Explicitly start Node with output unbuffered
exec 2>&1
/usr/local/bin/node /app/server.js
EOF
RUN chmod +x /app/run.sh

# Use the minimal wrapper instead of start.sh
CMD ["/app/run.sh"]
