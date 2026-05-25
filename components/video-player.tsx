"use client";

import { Player } from "@remotion/player";
import type { ComponentType } from "react";

interface VideoPlayerProps {
  component: ComponentType<Record<string, unknown>>;
  props: Record<string, unknown>;
  durationInFrames: number;
  fps?: number;
  width?: number;
  height?: number;
  style?: React.CSSProperties;
}

export default function VideoPlayer({
  component,
  props,
  durationInFrames,
  fps = 30,
  width = 1080,
  height = 1920,
  style,
}: VideoPlayerProps) {
  // Scale to fit in a fixed preview area (vertical 9:16)
  const previewHeight = 520;
  const previewWidth = Math.round((previewHeight * width) / height);

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        ...style,
      }}
    >
      <Player
        component={component}
        inputProps={props}
        durationInFrames={durationInFrames}
        fps={fps}
        compositionWidth={width}
        compositionHeight={height}
        style={{
          width: previewWidth,
          height: previewHeight,
          borderRadius: 12,
          overflow: "hidden",
        }}
        controls
        showVolumeControls
        loop
      />
    </div>
  );
}
