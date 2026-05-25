# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

# Install Python + system dependencies for cv2/PIL/ffmpeg
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-dev \
    ffmpeg \
    libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install Python video processing libs
RUN pip3 install --no-cache-dir --break-system-packages \
    opencv-python-headless \
    Pillow \
    numpy

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

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
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --no-cache-dir --break-system-packages \
    opencv-python-headless \
    Pillow \
    numpy

ENV NODE_ENV=production
# Tell all scripts to use system ffmpeg instead of the Remotion macOS binary
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV FFPROBE_PATH=/usr/bin/ffprobe

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/node_modules ./node_modules

# Create directories for uploads and renders
RUN mkdir -p public/assets public/renders .studio

EXPOSE 3000
CMD ["node", "server.js"]
