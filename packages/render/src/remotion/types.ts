/** Props passed into the Remotion composition. Assembled by the render stage
 *  (Phase 7), which resolves S3 keys → reachable URLs. No React imports here so
 *  the package index can re-export these types without pulling in Remotion. */

export const COMPOSITION_ID = "AutoVisual";

export interface RenderVisual {
  url: string;
  type: "IMAGE" | "VIDEO" | "ANIMATION";
  startSec: number;
  endSec: number;
  kenBurns?: { fromScale: number; toScale: number };
  enterSec?: number;
  exitSec?: number;
}

export interface RenderCaptionWord {
  word: string;
  start: number;
  end: number;
  highlight?: boolean;
  emoji?: string;
}

export interface RenderCaptionMeta {
  fontFamily?: string;
  fontSizePx?: number;
  primaryColor?: string;
  highlightColor?: string;
  strokeColor?: string;
  strokeWidthPx?: number;
  uppercase?: boolean;
  positionY?: number;
}

export interface RenderCaption {
  startSec: number;
  endSec: number;
  animation: string;
  words: RenderCaptionWord[];
  meta: RenderCaptionMeta;
}

export interface RenderBranding {
  logoUrl?: string;
  watermarkUrl?: string;
  username?: string;
  website?: string;
  socialHandle?: string;
  colors?: { primary?: string; accent?: string };
}

// `type` (not `interface`) so it satisfies Remotion's `Record<string, unknown>`
// constraint on composition props.
export type RenderProps = {
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  facecamUrl: string;
  visuals: RenderVisual[];
  captions: RenderCaption[];
  /** Second caption track (original language) for Dual subtitle mode. */
  secondaryCaptions?: RenderCaption[];
  branding?: RenderBranding;
};

export const DEFAULT_RENDER_PROPS: RenderProps = {
  width: 1080,
  height: 1920,
  fps: 30,
  durationInFrames: 90,
  facecamUrl: "",
  visuals: [],
  captions: [],
};
