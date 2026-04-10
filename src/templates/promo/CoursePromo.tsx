import React from "react";
import {AbsoluteFill, Sequence} from "remotion";
import {AnimatedTitle} from "../../components/text/AnimatedTitle";
import {GradientBackground} from "../../components/backgrounds/GradientBackground";
import {CallToAction} from "../../components/overlays/CallToAction";
import {CountdownTimer} from "../../components/overlays/CountdownTimer";
import {MorphingText} from "../../components/text/MorphingText";
import {NeonGlow} from "../../components/overlays/NeonGlow";
import {ProgressBar} from "../../components/overlays/ProgressBar";
import {SafeArea} from "../../components/layout/SafeArea";
import {loadDefaultFonts} from "../../presets/fonts";

export interface CoursePromoProps {
  courseName?: string;
  benefits?: string[];
  price?: string;
  urgencyText?: string;
  cta?: string;
  countdownSeconds?: number;
  backgroundColors?: string[];
  accentColor?: string;
}

/**
 * Course promo template for vertical social content (1080x1920).
 * Duration: ~360 frames (12s at 30fps)
 */
export const CoursePromo: React.FC<CoursePromoProps> = ({
  courseName = "Domina la IA en 30 Días",
  benefits = ["Sin experiencia previa", "Resultados en semanas", "Comunidad 24/7"],
  price = "$97",
  urgencyText = "Solo 20 cupos",
  cta = "¡Únete ahora →",
  countdownSeconds = 48 * 3600,
  backgroundColors = ["#0f0f23", "#1a0a2e", "#0a1a2e"],
  accentColor = "#f43f5e",
}) => {
  loadDefaultFonts();

  return (
    <AbsoluteFill>
      <GradientBackground colors={backgroundColors} angle={160} animated />

      <SafeArea paddingHorizontal={60} paddingVertical={120}>
        {/* Course name with neon glow */}
        <Sequence from={0} durationInFrames={90}>
          <AbsoluteFill
            style={{
              justifyContent: "center",
              alignItems: "center",
              flexDirection: "column",
              gap: 20,
            }}
          >
            <NeonGlow
              text={courseName}
              fontSize={58}
              glowColor={accentColor}
              glowIntensity={0.8}
              style={{textAlign: "center", maxWidth: "90%"}}
            />
          </AbsoluteFill>
        </Sequence>

        {/* Morphing benefits */}
        <Sequence from={80} durationInFrames={160}>
          <AbsoluteFill
            style={{
              justifyContent: "center",
              alignItems: "center",
              flexDirection: "column",
              gap: 24,
            }}
          >
            <div
              style={{
                fontSize: 32,
                color: "rgba(255,255,255,0.6)",
                fontFamily: "'Inter', sans-serif",
                textAlign: "center",
              }}
            >
              Lo que vas a lograr:
            </div>
            <MorphingText
              words={benefits}
              holdDuration={45}
              morphDuration={15}
              fontSize={56}
              color="#ffffff"
              accentColor={accentColor}
            />
          </AbsoluteFill>
        </Sequence>

        {/* Price + urgency */}
        <Sequence from={230} durationInFrames={80}>
          <AbsoluteFill
            style={{
              justifyContent: "center",
              alignItems: "center",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <div
              style={{
                fontSize: 120,
                fontFamily: "'Poppins', sans-serif",
                fontWeight: 900,
                color: accentColor,
                lineHeight: 1,
                textShadow: `0 0 40px ${accentColor}66`,
              }}
            >
              {price}
            </div>
            <div
              style={{
                fontSize: 28,
                fontFamily: "'Inter', sans-serif",
                fontWeight: 600,
                color: "rgba(255,255,255,0.8)",
                backgroundColor: "rgba(244,63,94,0.15)",
                padding: "8px 24px",
                borderRadius: 8,
                border: `1px solid ${accentColor}44`,
              }}
            >
              ⚡ {urgencyText}
            </div>
          </AbsoluteFill>
        </Sequence>

        {/* CTA */}
        <Sequence from={300} durationInFrames={60}>
          <AbsoluteFill
            style={{
              justifyContent: "flex-end",
              alignItems: "center",
              paddingBottom: 160,
            }}
          >
            <CallToAction
              text={cta}
              backgroundColor={accentColor}
              position="center"
              style={{
                position: "relative",
                top: "auto",
                left: "auto",
                right: "auto",
                bottom: "auto",
              }}
            />
          </AbsoluteFill>
        </Sequence>

        {/* Progress bar */}
        <ProgressBar accentColor={accentColor} height={4} />
      </SafeArea>
    </AbsoluteFill>
  );
};
