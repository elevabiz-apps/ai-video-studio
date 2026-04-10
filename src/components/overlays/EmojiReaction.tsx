import React from "react";
import {useCurrentFrame, useVideoConfig, spring, interpolate} from "remotion";

export interface EmojiReactionItem {
  emoji: string;
  /** Frame at which this reaction starts */
  startFrame: number;
  /** Horizontal position 0-1 (left to right) */
  xRatio?: number;
}

export interface EmojiReactionProps {
  reactions: EmojiReactionItem[];
  /** How many frames each emoji is visible for */
  lifetime?: number;
  fontSize?: number;
  style?: React.CSSProperties;
}

export const EmojiReaction: React.FC<EmojiReactionProps> = ({
  reactions,
  lifetime = 60,
  fontSize = 56,
  style,
}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
        ...style,
      }}
    >
      {reactions.map((reaction, i) => {
        const age = frame - reaction.startFrame;
        if (age < 0 || age > lifetime) return null;

        const progress = age / lifetime;

        const opacity = interpolate(
          progress,
          [0, 0.1, 0.7, 1],
          [0, 1, 1, 0],
          {extrapolateLeft: "clamp", extrapolateRight: "clamp"},
        );

        const xRatio = reaction.xRatio ?? (((i * 0.37 + 0.2) % 0.8) + 0.1);
        const xPx = xRatio * width;

        // Float upward
        const yStart = height * 0.75;
        const yEnd = height * 0.15;
        const y = interpolate(progress, [0, 1], [yStart, yEnd]);

        // Wobble side to side
        const wobble = Math.sin(age * 0.3 + i * 1.5) * 18;

        const scale = spring({
          fps,
          frame: age,
          config: {damping: 8, stiffness: 200},
        });

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: xPx + wobble,
              top: y,
              fontSize,
              opacity,
              transform: `scale(${scale})`,
              filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.5))",
            }}
          >
            {reaction.emoji}
          </div>
        );
      })}
    </div>
  );
};
