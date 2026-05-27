import React, {useEffect, useMemo, useState} from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  Sequence,
  staticFile,
  delayRender,
  continueRender,
  cancelRender,
} from "remotion";
import {
  createTikTokStyleCaptions,
  type Caption,
  type TikTokPage,
} from "@remotion/captions";
import {FONT_FAMILIES, loadGoogleFont} from "../../presets/fonts";

export type CaptionPreset = "classic" | "bold" | "outline" | "glow" | "box" | "impacto" | "rosa" | "impacto_rosa";

export interface CaptionOverlayProps {
  captionsSource: string;
  /** Pass captions JSON directly (skips fetch, used for web preview) */
  captionsData?: Caption[];
  preset?: CaptionPreset;
  position?: "top" | "center" | "bottom";
  fontSize?: number;
  fontFamily?: string;
  highlightColor?: string;
  textColor?: string;
  combineTokensWithinMs?: number;
  offsetMs?: number;
  style?: React.CSSProperties;
}

const PRESET_STYLES: Record<CaptionPreset, {
  bg: string;
  shadow: string;
  stroke: string;
  highlightBg: string;
  highlightColorOverride?: string;
  textTransform?: "uppercase" | "none";
}> = {
  classic: {
    bg: "transparent",
    shadow: "2px 2px 4px rgba(0,0,0,0.8)",
    stroke: "none",
    highlightBg: "transparent",
  },
  bold: {
    bg: "transparent",
    shadow: "0 4px 8px rgba(0,0,0,0.9), 0 2px 4px rgba(0,0,0,0.9)",
    stroke: "none",
    highlightBg: "transparent",
  },
  outline: {
    bg: "transparent",
    shadow: "-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000",
    stroke: "none",
    highlightBg: "transparent",
  },
  glow: {
    bg: "transparent",
    shadow: "0 0 20px rgba(99,102,241,0.8), 0 0 40px rgba(99,102,241,0.4)",
    stroke: "none",
    highlightBg: "transparent",
  },
  box: {
    bg: "rgba(0,0,0,0.75)",
    shadow: "none",
    stroke: "none",
    highlightBg: "rgba(99,102,241,0.9)",
  },
  impacto: {
    bg: "transparent",
    shadow: "-3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 3px 3px 0 #000",
    stroke: "none",
    highlightBg: "transparent",
    textTransform: "uppercase",
  },
  rosa: {
    bg: "rgba(139,32,96,0.9)",
    shadow: "none",
    stroke: "none",
    highlightBg: "rgba(139,32,96,1)",
    textTransform: "uppercase",
  },
  impacto_rosa: {
    bg: "transparent",
    shadow: "-3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 3px 3px 0 #000",
    stroke: "none",
    highlightBg: "transparent",
    highlightColorOverride: "#E1306C",
    textTransform: "uppercase",
  },
};

export const CaptionOverlay: React.FC<CaptionOverlayProps> = ({
  captionsSource,
  captionsData,
  preset = "impacto_rosa",
  position = "bottom",
  fontSize = 64,
  fontFamily = FONT_FAMILIES.heading,
  highlightColor = "#39E508",
  textColor = "#ffffff",
  combineTokensWithinMs = 1200,
  offsetMs = 0,
  style,
}) => {
  const [captions, setCaptions] = useState<Caption[] | null>(captionsData ?? null);
  const [handle] = useState(() =>
    captionsData ? null : delayRender("Loading captions")
  );
  const {fps} = useVideoConfig();

  const fontName = fontFamily.replace(/'/g, "").split(",")[0].trim();
  loadGoogleFont(fontName);

  useEffect(() => {
    // If captionsData was provided directly, skip fetch
    if (captionsData) {
      setCaptions(captionsData);
      return;
    }
    if (!captionsSource || !handle) return;
    fetch(staticFile(captionsSource))
      .then((r) => r.json())
      .then((data: Caption[]) => {
        // Apply offset if extracting a clip
        const adjusted = offsetMs
          ? data.map((c) => ({
              ...c,
              startMs: c.startMs - offsetMs,
              endMs: c.endMs - offsetMs,
            }))
          : data;
        setCaptions(adjusted.filter((c) => c.startMs >= 0));
        continueRender(handle);
      })
      .catch((e) => cancelRender(e));
  }, [captionsSource, captionsData, offsetMs, handle]);

  const pages = useMemo(() => {
    if (!captions) return [];
    const result = createTikTokStyleCaptions({
      captions,
      combineTokensWithinMilliseconds: combineTokensWithinMs,
    });
    return result.pages;
  }, [captions, combineTokensWithinMs]);

  if (!captions) return null;

  const basePositionStyle: React.CSSProperties = {
    top: {top: 80},
    center: {top: "50%", extraTransform: "translateY(-50%)"},
    bottom: {bottom: 120},
  }[position] as React.CSSProperties;

  // Merge custom style overrides
  const mergedPositionStyle: React.CSSProperties = {...basePositionStyle, ...style};

  // Extract transform separately so we can combine with translateX(-50%)
  const extraTransform = (mergedPositionStyle as any).extraTransform ?? mergedPositionStyle.transform ?? "";
  const {transform: _t, extraTransform: _e, ...positionStyleClean} = mergedPositionStyle as any;
  const combinedTransform = `translateX(-50%)${extraTransform ? ` ${extraTransform}` : ""}`;

  const presetStyle = PRESET_STYLES[preset];

  return (
    <>
      {pages.map((page, index) => {
        const startFrame = Math.round((page.startMs / 1000) * fps);
        // Page ends when the last token finishes + 200ms buffer
        // (not when the next page starts, to avoid showing stale captions during silences)
        const lastToken = page.tokens[page.tokens.length - 1];
        const pageEndMs = lastToken ? lastToken.toMs + 200 : page.startMs + combineTokensWithinMs;
        const nextStart = pages[index + 1]?.startMs ?? pageEndMs;
        const endMs = Math.min(nextStart, pageEndMs);
        const endFrame = Math.round((endMs / 1000) * fps);
        const duration = endFrame - startFrame;

        if (duration <= 0) return null;

        return (
          <Sequence key={index} from={startFrame} durationInFrames={duration}>
            <CaptionPage
              page={page}
              fontSize={fontSize}
              fontFamily={fontFamily}
              textColor={textColor}
              highlightColor={highlightColor}
              presetStyle={presetStyle}
              preset={preset}
              positionStyle={positionStyleClean}
              combinedTransform={combinedTransform}
            />
          </Sequence>
        );
      })}
    </>
  );
};

interface CaptionPageProps {
  page: TikTokPage;
  fontSize: number;
  fontFamily: string;
  textColor: string;
  highlightColor: string;
  presetStyle: typeof PRESET_STYLES[CaptionPreset];
  preset: CaptionPreset;
  positionStyle: React.CSSProperties;
  combinedTransform: string;
}

const CaptionPage: React.FC<CaptionPageProps> = ({
  page,
  fontSize,
  fontFamily,
  textColor,
  highlightColor,
  presetStyle,
  preset,
  positionStyle,
  combinedTransform,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const currentTimeMs = (frame / fps) * 1000;
  const absoluteTimeMs = page.startMs + currentTimeMs;

  return (
    <div
      style={{
        position: "absolute",
        textAlign: "center",
        maxWidth: "85%",
        pointerEvents: "none",
        padding: preset === "box" ? "12px 20px" : 0,
        borderRadius: preset === "box" ? 8 : 0,
        backgroundColor: preset === "box" ? presetStyle.bg : "transparent",
        ...positionStyle,
        left: "50%",
        transform: combinedTransform,
      }}
    >
      <span
        style={{
          fontSize,
          fontFamily,
          fontWeight: 800,
          lineHeight: 1.3,
          whiteSpace: "nowrap",
        }}
      >
        {page.tokens.map((token, i) => {
          const isActive =
            token.fromMs <= absoluteTimeMs && token.toMs > absoluteTimeMs;
          const activeColor = presetStyle.highlightColorOverride ?? highlightColor;
          const text = presetStyle.textTransform === "uppercase"
            ? token.text.toUpperCase()
            : token.text;

          return (
            <span
              key={i}
              style={{
                color: isActive ? activeColor : textColor,
                textShadow: presetStyle.shadow,
                backgroundColor: isActive && (preset === "box" || preset === "rosa")
                  ? presetStyle.highlightBg
                  : "transparent",
                borderRadius: (preset === "box" || preset === "rosa") ? 4 : 0,
                padding: (preset === "box" || preset === "rosa") ? "2px 4px" : 0,
              }}
            >
              {text}
            </span>
          );
        })}
      </span>
    </div>
  );
};
