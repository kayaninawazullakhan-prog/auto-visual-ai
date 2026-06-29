/**
 * @ava/render — Remotion 9:16 composition + (Phase 7) FFmpeg/quality utils.
 *
 * Only types + plain values are re-exported here so consumers (e.g. the worker)
 * can import render props without pulling React/Remotion into their bundle. The
 * actual composition lives under ./remotion and is loaded by the Remotion
 * bundler via `remotionEntry`.
 */
export {
  COMPOSITION_ID,
  DEFAULT_RENDER_PROPS,
  type RenderProps,
  type RenderVisual,
  type RenderCaption,
  type RenderCaptionWord,
  type RenderCaptionMeta,
  type RenderBranding,
} from "./remotion/types.js";
export { remotionEntry } from "./entry-path.js";
export { remotionWebpackOverride } from "./webpack-override.js";
export { renderComposition } from "./render.js";
