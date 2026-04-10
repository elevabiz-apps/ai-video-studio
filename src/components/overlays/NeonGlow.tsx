import React from "react";
import {useCurrentFrame, useVideoConfig, interpolate, spring} from "remotion";
import {FONT_FAMILIES, loadGoogleFont} from "../../presets/fonts";

export interface NeonGlowProps {
  text: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  color?: string;
  glowColor?: string;
  glowIntensity?: number;
  /** Animate the glow flickering like a real neon sign */
  flicker?: boolean;
  enterDelay?: number;
  style?: React.CSSProperties;
}

export const NeonGlow: React.FC<NeonGlowProps> = ({
  text,
  fontSize = 80,
  fontFamily = FONT_FAMILIES.display,
  fontWeight = 700,
  color = "#ffffff",
  glowColor = "#00ff88",
  glowIntensity = 1,
  flicker = true,
  enterDelay = 0,
  style,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const fontName = fontFamily.replace(/'/g, "").split(",")[0].trim();
  loadGoogleFont(fontName);

  const adjustedFrame = Math.max(0, frame - enterDelay);
  if (adjustedFrame <= 0) return null;

  const revealProgress = spring({
    fps,
    frame: adjustedFrame,
    config: {damping: 14, stiffness: 90},
  });

  // Neon flicker simulation: fast noise driven by frame
  let flickerFactor = 1;
  if (flicker) {
    const flickerSeed = (adjustedFrame * 7 + 13) % 60;
    const slowBlink = Math.sin(adjustedFrame * 0.08) * 0.05;
    const fastNoise = Math.sin(adjustedFrame * 1.7) * 0.03;
    const randomSpike =
      (adjustedFrame % 47 === 0 || adjustedFrame % 31 === 0) ? -0.15 : 0;
    flickerFactor = Math.max(0.7, 1 + slowBlink + fastNoise + randomSpike);
  }

  const opacity = interpolate(revealProgress, [0, 1], [0, 1]);
  const blur1 = 4 * glowIntensity * flickerFactor;
  const blur2 = 16 * glowIntensity * flickerFactor;
  const blur3 = 40 * glowIntensity * flickerFactor;

  const textShadow = [
    `0 0 ${blur1}px ${glowColor}`,
    `0 0 ${blur2}px ${glowColor}`,
    `0 0 ${blur3}px ${glowColor}`,
    `0 0 ${blur3 * 2}px ${glowColor}`,
  ].join(", ");

  const scale = interpolate(revealProgress, [0, 0.6, 1], [0.8, 1.05, 1]);

  return (
    <div
      style={{
        opacity,
        transform: `scale(${scale})`,
        fontSize,
        fontFamily,
        fontWeight,
        color,
        textShadow,
        letterSpacing: "0.05em",
        ...style,
      }}
    >
      {text}
    </div>
  );
};
