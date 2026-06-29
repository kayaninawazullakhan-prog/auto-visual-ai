/**
 * Programmatic Remotion render of the 9:16 composition (render stage, Phase 7).
 *
 * This module imports `@remotion/bundler` / `@remotion/renderer`, which pull in
 * Node-only dependencies (webpack, esbuild, a headless browser). It must NOT be
 * re-exported from the type-only section of the package index — consumers import
 * `renderComposition` directly and run it in the worker process.
 */
import { bundle } from "@remotion/bundler";
import { selectComposition, renderMedia } from "@remotion/renderer";
import { COMPOSITION_ID } from "./remotion/types.js";
import type { RenderProps } from "./remotion/types.js";
import { remotionEntry } from "./entry-path.js";
import { remotionWebpackOverride } from "./webpack-override.js";

/**
 * Bundling the Remotion entry is expensive (a full webpack build), so we cache
 * the resulting serve URL in a module-level promise. Repeated renders in the
 * same worker process reuse the bundle instead of rebuilding it.
 */
let bundlePromise: Promise<string> | null = null;

function getServeUrl(): Promise<string> {
  if (!bundlePromise) {
    bundlePromise = bundle({
      entryPoint: remotionEntry,
      webpackOverride: remotionWebpackOverride,
    });
  }
  return bundlePromise;
}

/**
 * Render `props` into an H.264 MP4 at `outputPath`. Reuses a cached webpack
 * bundle across calls. `opts.concurrency` maps to Remotion's `concurrency`
 * (number of parallel frame-rendering tabs); omit to let Remotion auto-pick.
 */
export async function renderComposition(
  props: RenderProps,
  outputPath: string,
  opts?: { concurrency?: number },
): Promise<void> {
  const serveUrl = await getServeUrl();

  const composition = await selectComposition({
    serveUrl,
    id: COMPOSITION_ID,
    inputProps: props,
  });

  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: outputPath,
    inputProps: props,
    concurrency: opts?.concurrency ?? null,
  });
}
