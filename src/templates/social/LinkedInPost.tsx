import React from "react";
import {AbsoluteFill, Sequence} from "remotion";
import {AnimatedTitle} from "../../components/text/AnimatedTitle";
import {GradientBackground} from "../../components/backgrounds/GradientBackground";
import {CallToAction} from "../../components/overlays/CallToAction";
import {SocialCounter} from "../../components/overlays/SocialCounter";
import {GlassmorphismCard} from "../../components/backgrounds/GlassmorphismCard";
import {SafeArea} from "../../components/layout/SafeArea";
import {loadDefaultFonts} from "../../presets/fonts";

export interface LinkedInPostProps {
  headline?: string;
  insight?: string;
  cta?: string;
  metric?: number;
  metricLabel?: string;
  backgroundColors?: string[];
  accentColor?: string;
}

/**
 * LinkedIn 1:1 square post (1080x1080) — professional, insight-driven format.
 * Duration: ~300 frames (10s at 30fps)
 */
export const LinkedInPost: React.FC<LinkedInPostProps> = ({
  headline = "La IA no te va a reemplazar.",
  insight = "Pero sí alguien que sabe\nusar IA mejor que tú.",
  cta = "¿Qué estás haciendo hoy para adaptarte?",
  metric = 47000,
  metricLabel = "impresiones",
  backgroundColors = ["#0c1222", "#162032"],
  accentColor = "#0077b5",
}) => {
  loadDefaultFonts();

  return (
    <AbsoluteFill>
      <GradientBackground colors={backgroundColors} angle={135} />

      <SafeArea paddingHorizontal={80} paddingVertical={80}>
        {/* Headline */}
        <Sequence from={0} durationInFrames={100}>
          <AbsoluteFill style={{justifyContent: "center", alignItems: "center"}}>
            <AnimatedTitle
              text={headline}
              fontSize={72}
              fontWeight={900}
              color="#ffffff"
              enterAnimation="slideDown"
              exitAnimation="fade"
              enterDuration={18}
              holdDuration={60}
              exitDuration={15}
              style={{textAlign: "center", maxWidth: "85%"}}
            />
          </AbsoluteFill>
        </Sequence>

        {/* Key insight card */}
        <Sequence from={85} durationInFrames={130}>
          <AbsoluteFill
            style={{
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <GlassmorphismCard
              accentColor={accentColor}
              width={820}
              height={240}
              enterDelay={0}
            >
              <div
                style={{
                  fontSize: 40,
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 700,
                  color: "#ffffff",
                  textAlign: "center",
                  lineHeight: 1.4,
                  whiteSpace: "pre-line",
                }}
              >
                {insight}
              </div>
            </GlassmorphismCard>
          </AbsoluteFill>
        </Sequence>

        {/* Metric + CTA */}
        <Sequence from={200} durationInFrames={100}>
          <AbsoluteFill
            style={{
              flexDirection: "column",
              justifyContent: "flex-end",
              alignItems: "center",
              paddingBottom: 100,
              gap: 32,
            }}
          >
            <SocialCounter
              targetCount={metric}
              label={metricLabel}
              platform="generic"
              accentColor={accentColor}
              fontSize={52}
              enterDelay={0}
            />
            <CallToAction
              text={cta}
              backgroundColor={`${accentColor}ee`}
              position="center"
              enterDelay={20}
              style={{position: "relative", top: "auto", left: "auto", right: "auto", bottom: "auto"}}
            />
          </AbsoluteFill>
        </Sequence>
      </SafeArea>
    </AbsoluteFill>
  );
};
