import React from "react";
import {useCurrentFrame, useVideoConfig, spring, interpolate} from "remotion";
import {FONT_FAMILIES, loadGoogleFont} from "../../presets/fonts";

export interface GlassmorphismCardProps {
  title?: string;
  body?: string;
  /** Accent color for border and glow */
  accentColor?: string;
  /** Card width in px */
  width?: number;
  /** Card height in px */
  height?: number;
  /** Blur strength for the glass background */
  blur?: number;
  /** Background tint opacity 0-1 */
  bgOpacity?: number;
  borderOpacity?: number;
  fontFamily?: string;
  textColor?: string;
  enterDelay?: number;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export const GlassmorphismCard: React.FC<GlassmorphismCardProps> = ({
  title,
  body,
  accentColor = "#6366f1",
  width = 500,
  height = 300,
  blur = 20,
  bgOpacity = 0.15,
  borderOpacity = 0.4,
  fontFamily = FONT_FAMILIES.heading,
  textColor = "#ffffff",
  enterDelay = 0,
  style,
  children,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const fontName = fontFamily.replace(/'/g, "").split(",")[0].trim();
  loadGoogleFont(fontName);

  const adjustedFrame = Math.max(0, frame - enterDelay);
  if (adjustedFrame <= 0) return null;

  const enterProgress = spring({
    fps,
    frame: adjustedFrame,
    config: {damping: 14, stiffness: 80},
  });

  const opacity = interpolate(enterProgress, [0, 1], [0, 1]);
  const scale = interpolate(enterProgress, [0, 0.7, 1], [0.85, 1.03, 1]);
  const translateY = interpolate(enterProgress, [0, 1], [30, 0]);

  // Subtle ambient glow pulse
  const glowPulse = 0.6 + Math.sin(adjustedFrame * 0.04) * 0.4;

  return (
    <div
      style={{
        width,
        height,
        borderRadius: 20,
        backdropFilter: `blur(${blur}px) saturate(1.4)`,
        backgroundColor: `rgba(255,255,255,${bgOpacity})`,
        border: `1px solid rgba(255,255,255,${borderOpacity})`,
        boxShadow: `0 0 ${40 * glowPulse}px ${accentColor}44, 0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.2)`,
        padding: 32,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        opacity,
        transform: `scale(${scale}) translateY(${translateY}px)`,
        ...style,
      }}
    >
      {title && (
        <div
          style={{
            fontSize: 28,
            fontFamily,
            fontWeight: 700,
            color: textColor,
            marginBottom: body ? 12 : 0,
          }}
        >
          {title}
        </div>
      )}
      {body && (
        <div
          style={{
            fontSize: 18,
            fontFamily,
            fontWeight: 400,
            color: `rgba(255,255,255,0.8)`,
            lineHeight: 1.5,
          }}
        >
          {body}
        </div>
      )}
      {children}
    </div>
  );
};
