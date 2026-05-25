import React from "react";
import {AbsoluteFill, staticFile} from "remotion";
import {FitVideo} from "../components/media/FitVideo";
import {CaptionOverlay} from "../components/text/CaptionOverlay";

export const DuelosEdit: React.FC = () => {
  return (
    <AbsoluteFill>
      <FitVideo
        src={staticFile("assets/3- Sobre los duelos y el aumento de peso_sin_silencios.mp4")}
        fit="cover"
        volume={1}
      />
      <CaptionOverlay
        captionsSource="captions.json"
        preset="outline"
        position="bottom"
        fontSize={56}
        textColor="#ffffff"
        highlightColor="#FFD700"
        combineTokensWithinMs={500}
        style={{bottom: "auto", top: 1150}}
      />
    </AbsoluteFill>
  );
};
