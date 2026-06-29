import type { WebpackOverrideFn } from "@remotion/bundler";

/**
 * Teach Remotion's webpack to resolve our ESM ".js" import specifiers to their
 * ".tsx"/".ts" sources (same as Next's extensionAlias). Used by the bundler in
 * the render stage.
 */
export const remotionWebpackOverride: WebpackOverrideFn = (config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    extensionAlias: {
      ...(config.resolve?.extensionAlias ?? {}),
      ".js": [".tsx", ".ts", ".js"],
      ".mjs": [".mts", ".mjs"],
    },
  },
});
