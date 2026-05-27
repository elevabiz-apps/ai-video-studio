import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for Docker/Railway deployment
  output: "standalone",
  // Allow large video uploads (500MB)
  experimental: {
    serverActions: {
      bodySizeLimit: "500mb",
    },
  },
  // Exclude heavy native packages from client bundle
  serverExternalPackages: [
    "better-sqlite3",
    "@remotion/renderer",
    "@remotion/compositor-darwin-arm64",
    "@remotion/compositor-linux-arm64",
    "@remotion/compositor-linux-x64",
    "fluent-ffmpeg",
    "sharp",
  ],
  // Exclude massive Remotion packages from standalone file tracing.
  // Without this, "Collecting build traces" hangs indefinitely because
  // Remotion includes huge native binaries that the tracer can't finish scanning.
  outputFileTracingExcludes: {
    "*": [
      "node_modules/remotion/**",
      "node_modules/@remotion/**",
      "node_modules/@imgly/**",
      "node_modules/sharp/**",
      "node_modules/fluent-ffmpeg/**",
    ],
  },
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
