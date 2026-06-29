import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { config as loadDotenv } from "dotenv";

// Load the single monorepo-root .env (Next only auto-loads app-local .env files).
const here = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(here, "../../.env") });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Lint is a separate `pnpm lint` task; don't couple it to the production build.
  eslint: { ignoreDuringBuilds: true },
  // Compile our internal TS packages from source (no pre-build step needed).
  transpilePackages: [
    "@ava/db",
    "@ava/types",
    "@ava/config",
    "@ava/ai",
    "@ava/render",
    "@ava/storage",
    "@ava/queue",
  ],
  experimental: {
    // Server Actions only (small payloads). Large video uploads go to the
    // /api/files route, which is excluded from middleware so its body isn't
    // capped by the Edge layer — see middleware.ts.
    serverActions: { bodySizeLimit: "16mb" },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.amazonaws.com" },
      { protocol: "https", hostname: "**.cloudfront.net" },
    ],
  },
  webpack: (config) => {
    // Our internal @ava/* packages use ESM ".js" import specifiers that point at
    // ".ts" sources. Teach webpack to resolve them (matches tsc "Bundler" + tsx).
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
