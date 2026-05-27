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
  // Exclude large/build-only packages from standalone file tracing.
  // Without this, "Collecting build traces" hangs indefinitely.
  // NOTE: The Dockerfile copies the full node_modules over the standalone
  // output, so all packages remain available at runtime regardless.
  outputFileTracingExcludes: {
    "*": [
      // Remotion: native compositor binaries + large package tree
      "node_modules/remotion/**",
      "node_modules/@remotion/**",
      // googleapis: 194MB auto-generated clients for every Google API
      "node_modules/googleapis/**",
      "node_modules/google-apis-common/**",
      // Build tools (not needed at runtime)
      "node_modules/typescript/**",
      "node_modules/@esbuild/**",
      "node_modules/@rspack/**",
      "node_modules/tsx/**",
      "node_modules/@types/**",
      // Other heavy packages not needed in the standalone bundle
      "node_modules/@imgly/**",
      "node_modules/@img/**",
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
