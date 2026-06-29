import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/** Absolute path to the Remotion entry, for @remotion/bundler in the render stage. */
export const remotionEntry = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "remotion/index.ts",
);
