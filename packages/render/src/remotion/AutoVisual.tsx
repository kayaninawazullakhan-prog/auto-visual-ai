import React from "react";
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { RenderProps, RenderVisual, RenderCaption } from "./types.js";

// Top section = AI visuals; remaining = creator facecam. Captions overlay both.
const TOP_PCT = 0.55;

/** One AI-visual clip: fades in/out, with Ken Burns on stills. */
const VisualClip: React.FC<{ visual: RenderVisual; fps: number }> = ({ visual, fps }) => {
  const from = Math.round(visual.startSec * fps);
  const dur = Math.max(1, Math.round((visual.endSec - visual.startSec) * fps));
  return (
    <Sequence from={from} durationInFrames={dur}>
      <VisualInner visual={visual} fps={fps} dur={dur} />
    </Sequence>
  );
};

const VisualInner: React.FC<{ visual: RenderVisual; fps: number; dur: number }> = ({
  visual,
  fps,
  dur,
}) => {
  const frame = useCurrentFrame();
  const enter = Math.max(1, Math.round((visual.enterSec ?? 0.3) * fps));
  const exit = Math.max(1, Math.round((visual.exitSec ?? 0.3) * fps));
  const opacity = Math.min(
    interpolate(frame, [0, enter], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    interpolate(frame, [dur - exit, dur], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
  );
  const scale = visual.kenBurns
    ? interpolate(frame, [0, dur], [visual.kenBurns.fromScale, visual.kenBurns.toScale], {
        extrapolateRight: "clamp",
      })
    : 1;
  const style: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    transform: `scale(${scale})`,
    opacity,
  };
  return visual.type === "VIDEO" ? (
    <OffthreadVideo src={visual.url} muted style={style} />
  ) : (
    <Img src={visual.url} style={style} />
  );
};

function captionAnim(
  name: string,
  frame: number,
  fps: number,
): { transform: string; opacity: number } {
  switch (name) {
    case "POP": {
      const s = spring({ frame, fps, config: { damping: 12, stiffness: 200, mass: 0.6 } });
      return { transform: `scale(${0.6 + 0.4 * s})`, opacity: Math.min(1, frame / 3) };
    }
    case "ZOOM":
      return {
        transform: `scale(${interpolate(frame, [0, 8], [1.4, 1], { extrapolateRight: "clamp" })})`,
        opacity: interpolate(frame, [0, 6], [0, 1], { extrapolateRight: "clamp" }),
      };
    case "BOUNCE": {
      const s = spring({ frame, fps, config: { damping: 8, stiffness: 180, mass: 0.7 } });
      return { transform: `translateY(${(1 - s) * 30}px) scale(${0.8 + 0.2 * s})`, opacity: Math.min(1, frame / 3) };
    }
    case "SLIDE":
      return {
        transform: `translateY(${interpolate(frame, [0, 8], [40, 0], { extrapolateRight: "clamp" })}px)`,
        opacity: interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" }),
      };
    case "SCALE":
      return {
        transform: `scale(${interpolate(frame, [0, 8], [0.8, 1], { extrapolateRight: "clamp" })})`,
        opacity: interpolate(frame, [0, 6], [0, 1], { extrapolateRight: "clamp" }),
      };
    case "GLOW":
    case "FADE":
    default:
      return {
        transform: "none",
        opacity: interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" }),
      };
  }
}

/** Active caption with per-word highlighting at the current time. */
const CaptionsLayer: React.FC<{ captions: RenderCaption[] }> = ({ captions }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const cap = captions.find((c) => t >= c.startSec && t < c.endSec);
  if (!cap) return null;

  const meta = cap.meta;
  const local = frame - Math.round(cap.startSec * fps);
  const anim = captionAnim(cap.animation, local, fps);
  const glow = cap.animation === "GLOW";

  return (
    <div
      style={{
        position: "absolute",
        top: `${(meta.positionY ?? 0.7) * 100}%`,
        left: 0,
        width: "100%",
        padding: "0 6%",
        display: "flex",
        justifyContent: "center",
        textAlign: "center",
        transform: anim.transform,
        opacity: anim.opacity,
      }}
    >
      <div
        style={{
          fontFamily: meta.fontFamily ?? "Inter, Arial, sans-serif",
          fontSize: meta.fontSizePx ?? 64,
          fontWeight: 800,
          lineHeight: 1.15,
          WebkitTextStroke: `${meta.strokeWidthPx ?? 6}px ${meta.strokeColor ?? "#000000"}`,
          paintOrder: "stroke fill",
        }}
      >
        {cap.words.map((w, i) => {
          const active = t >= w.start && t < w.end;
          const color = active ? meta.highlightColor ?? "#FFE100" : meta.primaryColor ?? "#FFFFFF";
          const text = meta.uppercase ? w.word.toUpperCase() : w.word;
          return (
            <span
              key={i}
              style={{
                color,
                margin: "0 0.16em",
                display: "inline-block",
                transform: active ? "scale(1.06)" : "scale(1)",
                textShadow: glow && active ? `0 0 18px ${color}` : undefined,
              }}
            >
              {text}
              {w.emoji ? ` ${w.emoji}` : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
};

const BrandingLayer: React.FC<{ branding: RenderProps["branding"] }> = ({ branding }) => {
  if (!branding) return null;
  return (
    <>
      {branding.watermarkUrl ? (
        <Img
          src={branding.watermarkUrl}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", opacity: 0.08 }}
        />
      ) : null}
      {branding.logoUrl ? (
        <Img src={branding.logoUrl} style={{ position: "absolute", top: 44, right: 44, width: 150, opacity: 0.95 }} />
      ) : null}
      {branding.socialHandle ? (
        <div
          style={{
            position: "absolute",
            bottom: 44,
            width: "100%",
            textAlign: "center",
            color: branding.colors?.primary ?? "#FFFFFF",
            fontFamily: "Inter, Arial, sans-serif",
            fontSize: 36,
            fontWeight: 700,
            textShadow: "0 2px 8px rgba(0,0,0,0.6)",
          }}
        >
          {branding.socialHandle}
        </div>
      ) : null}
    </>
  );
};

export const AutoVisual: React.FC<RenderProps> = ({
  facecamUrl,
  visuals,
  captions,
  secondaryCaptions,
  branding,
}) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      {/* Top: AI visuals */}
      <AbsoluteFill style={{ height: `${TOP_PCT * 100}%`, overflow: "hidden" }}>
        {visuals.map((v, i) => (
          <VisualClip key={i} visual={v} fps={fps} />
        ))}
      </AbsoluteFill>

      {/* Bottom: creator facecam (plays its own audio for perfect lip-sync) */}
      <AbsoluteFill style={{ top: `${TOP_PCT * 100}%`, height: `${(1 - TOP_PCT) * 100}%`, overflow: "hidden" }}>
        {facecamUrl ? (
          <OffthreadVideo src={facecamUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : null}
      </AbsoluteFill>

      {/* Overlays */}
      <CaptionsLayer captions={captions} />
      {secondaryCaptions && secondaryCaptions.length > 0 ? (
        <CaptionsLayer captions={secondaryCaptions} />
      ) : null}
      <BrandingLayer branding={branding} />
    </AbsoluteFill>
  );
};
