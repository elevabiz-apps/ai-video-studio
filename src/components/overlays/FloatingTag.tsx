import React from "react";
import {useCurrentFrame, useVideoConfig, spring, interpolate} from "remotion";
import {FONT_FAMILIES, loadGoogleFont} from "../../presets/fonts";

export interface FloatingTagProps {
  text: string;
  subtext?: string;
  /** Pixel position from left (0-1920) */
  x?: number;
  /** Pixel position from top (0-1080) */
  y?: number;
  /** Which direction the arrow points */
  arrowDirection?: "up" | "down" | "left" | "right";
  backgroundColor?: string;
  textColor?: string;
  accentColor?: string;
  fontFamily?: string;
  enterDelay?: number;
  /** If true, the tag bobs up and down continuously */
  float?: boolean;
  style?: React.CSSProperties;
}

export const FloatingTag: React.FC<FloatingTagProps> = ({
  text,
  subtext,
  x = 300,
  y = 300,
  arrowDirection = "down",
  backgroundColor = "rgba(99,102,241,0.95)",
  textColor = "#ffffff",
  accentColor = "#c4b5fd",
  fontFamily = FONT_FAMILIES.heading,
  enterDelay = 0,
  float = true,
  style,
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
    config: {damping: 10, stiffness: 120},
  });

  const opacity = interpolate(enterProgress, [0, 1], [0, 1]);
  const enterScale = interpolate(enterProgress, [0, 0.7, 1], [0.5, 1.08, 1]);

  // Floating bob
  const bobOffset = float
    ? Math.sin(adjustedFrame * 0.06) * 6
    : 0;

  const arrowSize = 10;
  const arrowStyles: Record<string, React.CSSProperties> = {
    down: {
      width: 0,
      height: 0,
      borderLeft: `${arrowSize}px solid transparent`,
      borderRight: `${arrowSize}px solid transparent`,
      borderTop: `${arrowSize * 1.5}px solid ${backgroundColor}`,
      position: "absolute",
      bottom: -arrowSize * 1.5,
      left: "50%",
      transform: "translateX(-50%)",
    },
    up: {
      width: 0,
      height: 0,
      borderLeft: `${arrowSize}px solid transparent`,
      borderRight: `${arrowSize}px solid transparent`,
      borderBottom: `${arrowSize * 1.5}px solid ${backgroundColor}`,
      position: "absolute",
      top: -arrowSize * 1.5,
      left: "50%",
      transform: "translateX(-50%)",
    },
    left: {
      width: 0,
      height: 0,
      borderTop: `${arrowSize}px solid transparent`,
      borderBottom: `${arrowSize}px solid transparent`,
      borderRight: `${arrowSize * 1.5}px solid ${backgroundColor}`,
      position: "absolute",
      left: -arrowSize * 1.5,
      top: "50%",
      transform: "translateY(-50%)",
    },
    right: {
      width: 0,
      height: 0,
      borderTop: `${arrowSize}px solid transparent`,
      borderBottom: `${arrowSize}px solid transparent`,
      borderLeft: `${arrowSize * 1.5}px solid ${backgroundColor}`,
      position: "absolute",
      right: -arrowSize * 1.5,
      top: "50%",
      transform: "translateY(-50%)",
    },
  };

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y + bobOffset,
        opacity,
        transform: `scale(${enterScale})`,
        ...style,
      }}
    >
      <div
        style={{
          position: "relative",
          backgroundColor,
          padding: "10px 18px",
          borderRadius: 10,
          backdropFilter: "blur(12px)",
          boxShadow: "0 6px 24px rgba(0,0,0,0.4)",
          whiteSpace: "nowrap",
        }}
      >
        <div
          style={{
            fontSize: 22,
            fontFamily,
            fontWeight: 700,
            color: textColor,
            lineHeight: 1.2,
          }}
        >
          {text}
        </div>
        {subtext && (
          <div
            style={{
              fontSize: 16,
              fontFamily,
              fontWeight: 400,
              color: accentColor,
              marginTop: 3,
            }}
          >
            {subtext}
          </div>
        )}
        <div style={arrowStyles[arrowDirection]} />
      </div>
    </div>
  );
};
