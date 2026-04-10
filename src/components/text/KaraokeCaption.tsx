import React from "react";
import {useCurrentFrame, useVideoConfig, interpolate} from "remotion";
import {FONT_FAMILIES, loadGoogleFont} from "../../presets/fonts";

export interface KaraokeWord {
  text: string;
  startFrame: number;
  endFrame: number;
}

export interface KaraokeCaptionProps {
  words: KaraokeWord[];
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  /** Color for already-sung words */
  pastColor?: string;
  /** Color for the currently active word */
  activeColor?: string;
  /** Color for upcoming words */
  futureColor?: string;
  /** Highlight background behind active word */
  highlightBg?: string;
  backgroundColor?: string;
  padding?: number;
  borderRadius?: number;
  maxWidth?: string;
  wordsPerLine?: number;
  position?: "top" | "center" | "bottom";
  style?: React.CSSProperties;
}

export const KaraokeCaption: React.FC<KaraokeCaptionProps> = ({
  words,
  fontSize = 52,
  fontFamily = FONT_FAMILIES.display,
  fontWeight = 800,
  pastColor = "rgba(99,102,241,0.9)",
  activeColor = "#ffffff",
  futureColor = "rgba(255,255,255,0.4)",
  highlightBg = "rgba(99,102,241,0.35)",
  backgroundColor = "rgba(0,0,0,0.75)",
  padding = 18,
  borderRadius = 14,
  maxWidth = "85%",
  wordsPerLine = 6,
  position = "bottom",
  style,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const fontName = fontFamily.replace(/'/g, "").split(",")[0].trim();
  loadGoogleFont(fontName);

  const activeIndex = words.findIndex(
    (w) => frame >= w.startFrame && frame <= w.endFrame,
  );
  if (activeIndex === -1 && frame < words[0]?.startFrame) return null;
  if (activeIndex === -1 && frame > (words[words.length - 1]?.endFrame ?? 0)) return null;

  const effectiveActive = activeIndex === -1
    ? words.findIndex((w) => frame < w.startFrame) - 1
    : activeIndex;

  const lineIndex = Math.floor(effectiveActive / wordsPerLine);
  const lineStart = lineIndex * wordsPerLine;
  const lineEnd = Math.min(words.length, lineStart + wordsPerLine);
  const lineWords = words.slice(lineStart, lineEnd);

  const positionStyles: React.CSSProperties =
    position === "top"
      ? {top: 80}
      : position === "center"
      ? {top: "50%", transform: "translateY(-50%)"}
      : {bottom: 120};

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        ...positionStyles,
        ...style,
      }}
    >
      <div
        style={{
          backgroundColor,
          padding: `${padding}px ${padding * 1.5}px`,
          borderRadius,
          maxWidth,
          textAlign: "center",
          backdropFilter: "blur(10px)",
        }}
      >
        {lineWords.map((word, i) => {
          const globalIndex = lineStart + i;
          const isActive = frame >= word.startFrame && frame <= word.endFrame;
          const isPast = frame > word.endFrame;

          // Pulse scale for active word
          const pulseProgress = isActive
            ? interpolate(
                (frame - word.startFrame) / Math.max(1, word.endFrame - word.startFrame),
                [0, 0.15, 1],
                [0.9, 1.08, 1],
                {extrapolateLeft: "clamp", extrapolateRight: "clamp"},
              )
            : 1;

          return (
            <span
              key={globalIndex}
              style={{
                fontSize,
                fontFamily,
                fontWeight,
                color: isActive ? activeColor : isPast ? pastColor : futureColor,
                marginRight: 10,
                display: "inline-block",
                transform: `scale(${pulseProgress})`,
                backgroundColor: isActive ? highlightBg : "transparent",
                padding: isActive ? "0 6px" : "0",
                borderRadius: 6,
                transition: "color 0.05s",
                textShadow: isActive ? "0 0 20px rgba(99,102,241,0.8)" : "none",
              }}
            >
              {word.text}
            </span>
          );
        })}
      </div>
    </div>
  );
};
