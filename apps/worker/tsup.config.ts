import { defineConfig } from "tsup";

/**
 * Bundle the worker (and our internal @ava/* source packages) into a single ESM
 * file. Prisma client stays external — it's a generated node module present at
 * runtime (copied into the Docker image / node_modules).
 */
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  bundle: true,
  noExternal: [/^@ava\//],
  // Prisma + the Remotion/rspack toolchain ship native binaries and must not be
  // bundled — they're resolved from node_modules at runtime (the worker also
  // runs directly via tsx, which never bundles).
  external: [
    "@prisma/client",
    ".prisma/client",
    "remotion",
    /^@remotion\//,
    /^@rspack\//,
    "esbuild",
    "webpack",
  ],
  clean: true,
  sourcemap: true,
});
