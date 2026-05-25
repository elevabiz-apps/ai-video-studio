import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Exclude heavy native packages from client bundle
  serverExternalPackages: [
    "better-sqlite3",
    "@remotion/renderer",
    "@remotion/compositor-darwin-arm64",
    "fluent-ffmpeg",
    "sharp",
  ],
  // Allow video/audio files from public/
  async headers() {
    return [
      {
        source: "/assets/:path*",
        headers: [
          { key: "Accept-Ranges", value: "bytes" },
          { key: "Cache-Control", value: "public, max-age=3600" },
        ],
      },
    ];
  },
};

export default nextConfig;
