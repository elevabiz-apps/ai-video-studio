"use client";

import { Player } from "@remotion/player";
import { AbsoluteFill, staticFile, Video } from "remotion";
import { CaptionOverlay, type CaptionPreset } from "@/src/components/text/CaptionOverlay";
import type { Caption } from "@remotion/captions";
import { useMemo } from "react";

interface VideoPreviewProps {
  videoPath: string;
  captionPreset: string;
  captionsJson: string | null;
  silenceJson: string | null;
  durationSeconds?: number;
}

// Simple composition for preview — wraps the video + captions
function PreviewComposition({
  videoSrc,
  captionsData,
  captionPreset,
}: {
  videoSrc: string;
  captionsData: Caption[] | null;
  captionPreset: CaptionPreset;
}) {
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Video
        src={videoSrc}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
      {captionsData && captionsData.length > 0 && (
        <CaptionOverlay
          captionsSource=""
          captionsData={captionsData}
          preset={captionPreset}
          position="bottom"
          fontSize={56}
          textColor="#ffffff"
          highlightColor="#FFD700"
          combineTokensWithinMs={500}
          style={{ bottom: "auto", top: 1150 }}
        />
      )}
    </AbsoluteFill>
  );
}

export default function VideoPreview({
  videoPath,
  captionPreset,
  captionsJson,
  silenceJson: _silenceJson,
  durationSeconds,
}: VideoPreviewProps) {
  const captions = useMemo<Caption[] | null>(() => {
    if (!captionsJson) return null;
    try {
      return JSON.parse(captionsJson);
    } catch {
      return null;
    }
  }, [captionsJson]);

  // Use actual video duration if available, otherwise fallback to 90s
  const fps = 30;
  const durationInFrames = durationSeconds
    ? Math.ceil(durationSeconds * fps)
    : 2700;

  // Preview area: vertical phone proportions
  const previewHeight = 500;
  const previewWidth = Math.round((previewHeight * 1080) / 1920);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
      <div
        style={{
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
          border: "2px solid var(--border)",
        }}
      >
        <Player
          component={PreviewComposition}
          inputProps={{
            videoSrc: staticFile(videoPath),
            captionsData: captions,
            captionPreset: captionPreset as CaptionPreset,
          }}
          durationInFrames={durationInFrames}
          fps={fps}
          compositionWidth={1080}
          compositionHeight={1920}
          style={{ width: previewWidth, height: previewHeight }}
          controls
          showVolumeControls
          loop
        />
      </div>
      <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
        Preview — 1080×1920 (vertical)
        {captions && ` · ${captions.length} palabras transcritas`}
      </div>
    </div>
  );
}
