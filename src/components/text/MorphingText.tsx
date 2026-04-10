import React from "react";
import {useCurrentFrame, useVideoConfig, spring, interpolate} from "remotion";
import {FONT_FAMILIES, loadGoogleFont} from "../../presets/fonts";

export interface MorphingTextProps {
  /** Array of words/phrases to cycle through */
  words: string[];
  /** Frames each word is displayed for (excluding transition) */
  holdDuration?: number;
  /** Frames the morph transition takes */
  morphDuration?: number;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  color?: string;
  accentColor?: string;
  style?: React.CSSProperties;
}

export const MorphingText: React.FC<MorphingTextProps> = ({
  words,
  holdDuration = 60,
  morphDuration = 20,
  fontSize = 72,
  fontFamily = FONT_FAMILIES.display,
  fontWeight = 900,
  color = "#ffffff",
  accentColor = "#6366f1",
  style,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  if (words.length === 0) return null;

  const fontName = fontFamily.replace(/'/g, "").split(",")[0].trim();
  loadGoogleFont(fontName);

  const cycleLength = holdDuration + morphDuration;
  const totalCycles = words.length;
  const totalFrames = cycleLength * totalCycles;

  const loopedFrame = frame % totalFrames;
  const cycleIndex = Math.floor(loopedFrame / cycleLength);
  const frameInCycle = loopedFrame % cycleLength;

  const currentWord = words[cycleIndex % words.length];
  const nextWord = words[(cycleIndex + 1) % words.length];

  const isTransitioning = frameInCycle >= holdDuration;
  const morphProgress = isTransitioning
    ? (frameInCycle - holdDuration) / morphDuration
    : 0;

  const exitOpacity = isTransitioning
    ? interpolate(morphProgress, [0, 1], [1, 0], {extrapolateRight: "clamp"})
    : 1;
  const enterOpacity = isTransitioning
    ? interpolate(morphProgress, [0, 1], [0, 1], {extrapolateRight: "clamp"})
    : 0;

  const exitBlur = isTransitioning
    ? interpolate(morphProgress, [0, 1], [0, 12])
    : 0;
  const enterBlur = isTransitioning
    ? interpolate(morphProgress, [0, 1], [12, 0])
    : 12;

  const exitScale = isTransitioning
    ? interpolate(morphProgress, [0, 1], [1, 0.85])
    : 1;
  const enterScale = isTransitioning
    ? interpolate(morphProgress, [0, 1], [1.15, 1])
    : 1.15;

  const sharedStyle: React.CSSProperties = {
    fontSize,
    fontFamily,
    fontWeight,
    color,
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    lineHeight: 1.1,
  };

  return (
    <div
      style={{
        position: "relative",
        height: fontSize * 1.3,
        ...style,
      }}
    >
      {/* Current word */}
      <div
        style={{
          ...sharedStyle,
          opacity: exitOpacity,
          filter: `blur(${exitBlur}px)`,
          transform: `scale(${exitScale})`,
        }}
      >
        {currentWord}
      </div>

      {/* Next word (entering) */}
      {isTransitioning && (
        <div
          style={{
            ...sharedStyle,
            opacity: enterOpacity,
            filter: `blur(${enterBlur}px)`,
            transform: `scale(${enterScale})`,
          }}
        >
          {nextWord}
        </div>
      )}
    </div>
  );
};
