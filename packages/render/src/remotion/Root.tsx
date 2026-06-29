import React from "react";
import { Composition } from "remotion";
import { AutoVisual } from "./AutoVisual.js";
import { COMPOSITION_ID, DEFAULT_RENDER_PROPS, type RenderProps } from "./types.js";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id={COMPOSITION_ID}
      component={AutoVisual}
      durationInFrames={DEFAULT_RENDER_PROPS.durationInFrames}
      fps={DEFAULT_RENDER_PROPS.fps}
      width={DEFAULT_RENDER_PROPS.width}
      height={DEFAULT_RENDER_PROPS.height}
      defaultProps={DEFAULT_RENDER_PROPS}
      calculateMetadata={({ props }: { props: RenderProps }) => ({
        durationInFrames: Math.max(1, Math.round(props.durationInFrames)),
        fps: props.fps,
        width: props.width,
        height: props.height,
      })}
    />
  );
};
