import React from "react";
import {useCurrentFrame, useVideoConfig, spring, interpolate} from "remotion";
import {FONT_FAMILIES, loadGoogleFont} from "../../presets/fonts";

export type SocialPlatform = "instagram" | "tiktok" | "youtube" | "twitter" | "generic";

export interface SocialCounterProps {
  /** Target number to count up to */
  targetCount: number;
  /** Starting number (default 0) */
  startCount?: number;
  label?: string;
  platform?: SocialPlatform;
  /** Duration in frames for the count-up animation */
  countDuration?: number;
  enterDelay?: number;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  accentColor?: string;
  /** Show a "+" suffix after the number */
  showPlus?: boolean;
  style?: React.CSSProperties;
}

const PLATFORM_COLORS: Record<SocialPlatform, string> = {
  instagram: "#E1306C",
  tiktok: "#69C9D0",
  youtube: "#FF0000",
  twitter: "#1DA1F2",
  generic: "#6366f1",
};

const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  instagram: "Seguidores",
  tiktok: "Seguidores",
  youtube: "Suscriptores",
  twitter: "Seguidores",
  generic: "Total",
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return n.toFixed(0);
}

export const SocialCounter: React.FC<SocialCounterProps> = ({
  targetCount,
  startCount = 0,
  label,
  platform = "generic",
  countDuration = 90,
  enterDelay = 0,
  fontSize = 64,
  fontFamily = FONT_FAMILIES.display,
  color = "#ffffff",
  accentColor,
  showPlus = true,
  style,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const fontName = fontFamily.replace(/'/g, "").split(",")[0].trim();
  loadGoogleFont(fontName);

  const adjustedFrame = Math.max(0, frame - enterDelay);
  if (adjustedFrame <= 0) return null;

  const resolvedAccent = accentColor ?? PLATFORM_COLORS[platform];
  const resolvedLabel = label ?? PLATFORM_LABELS[platform];

  const enterProgress = spring({
    fps,
    frame: adjustedFrame,
    config: {damping: 12, stiffness: 80},
  });

  // Ease-out count-up
  const countProgress = Math.min(1, adjustedFrame / countDuration);
  const easedProgress = 1 - Math.pow(1 - countProgress, 3);
  const currentCount = Math.round(startCount + (targetCount - startCount) * easedProgress);

  const opacity = interpolate(enterProgress, [0, 1], [0, 1]);
  const translateY = interpolate(enterProgress, [0, 1], [40, 0]);
  const scale = interpolate(enterProgress, [0, 0.7, 1], [0.7, 1.05, 1]);

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px) scale(${scale})`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        ...style,
      }}
    >
      <div
        style={{
          fontSize,
          fontFamily,
          fontWeight: 900,
          color,
          lineHeight: 1,
          textShadow: `0 4px 20px ${resolvedAccent}55`,
        }}
      >
        {formatNumber(currentCount)}
        {showPlus && countProgress >= 1 && (
          <span style={{color: resolvedAccent}}>+</span>
        )}
      </div>
      <div
        style={{
          fontSize: fontSize * 0.28,
          fontFamily,
          fontWeight: 600,
          color: resolvedAccent,
          marginTop: 6,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {resolvedLabel}
      </div>
    </div>
  );
};
