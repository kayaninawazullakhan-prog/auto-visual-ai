import { z } from "zod";

/**
 * Environment schema.
 *
 * Design rule: only the two infrastructure URLs are required to boot. Every
 * provider credential is optional so the app starts with whatever is configured
 * ("just add an API key"). Features check `features.*` (below) at call time and
 * throw a typed error if their key is missing — see @ava/ai.
 */
const optionalStr = z.string().trim().min(1).optional();

const schema = z.object({
  // --- Core ---
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  INTERNAL_API_URL: z.string().url().default("http://localhost:3000"),
  // Allow the shared demo user in production when Clerk auth isn't configured
  // (for public portfolio demos). Set to "true" to enable.
  DEMO_MODE: optionalStr,

  // --- Required infrastructure ---
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  // --- Auth: Clerk ---
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: optionalStr,
  CLERK_SECRET_KEY: optionalStr,
  CLERK_WEBHOOK_SECRET: optionalStr,

  // --- Payments: Stripe ---
  STRIPE_SECRET_KEY: optionalStr,
  STRIPE_WEBHOOK_SECRET: optionalStr,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: optionalStr,
  STRIPE_PRICE_STARTER: optionalStr,
  STRIPE_PRICE_PRO: optionalStr,
  STRIPE_PRICE_BUSINESS: optionalStr,

  // --- Storage ---
  // "local" (default) stores files on disk served by the app — no AWS needed.
  // "s3" uses AWS S3. Unset auto-detects: s3 if AWS keys present, else local.
  STORAGE_DRIVER: z.enum(["local", "s3"]).optional(),
  LOCAL_STORAGE_DIR: optionalStr, // absolute path; defaults to <repo>/.data/storage
  AWS_REGION: z.string().default("us-east-1"),
  AWS_ACCESS_KEY_ID: optionalStr,
  AWS_SECRET_ACCESS_KEY: optionalStr,
  S3_BUCKET: optionalStr,
  S3_PUBLIC_URL: optionalStr,
  S3_ENDPOINT: optionalStr,

  // --- LLM / understanding ---
  OPENAI_API_KEY: optionalStr,
  ANTHROPIC_API_KEY: optionalStr,
  UNDERSTANDING_PROVIDER: z.enum(["claude", "openai"]).default("claude"),
  ANTHROPIC_MODEL: z.string().default("claude-opus-4-8"),
  OPENAI_MODEL: z.string().default("gpt-4o"),

  // --- Transcription (Claude has no speech-to-text → local Whisper by default) ---
  // "local" runs whisper.cpp with no API key. "openai"/"replicate" use hosted Whisper.
  WHISPER_PROVIDER: z.enum(["openai", "replicate", "local"]).default("local"),
  WHISPER_MODEL: z.string().default("whisper-1"),
  // Replicate model used when WHISPER_PROVIDER=replicate (word-level via WhisperX).
  REPLICATE_WHISPER_MODEL: z.string().default("victor-upmeet/whisperx"),
  // whisper.cpp CLI invoked when WHISPER_PROVIDER=local (brew install whisper-cpp).
  WHISPER_LOCAL_CMD: z.string().default("whisper-cli"),
  // Absolute path to a whisper.cpp ggml model (multilingual recommended).
  WHISPER_LOCAL_MODEL: optionalStr,

  // --- Image generation ---
  IMAGE_PROVIDER: z.enum(["flux", "sdxl", "openai"]).default("flux"),
  FAL_KEY: optionalStr,
  REPLICATE_API_TOKEN: optionalStr,
  // Min ms between Replicate "create" calls to respect per-minute rate limits.
  // 0 = no pacing (paid accounts). Free tier is ~6/min → set ~11000.
  REPLICATE_MIN_INTERVAL_MS: z.coerce.number().int().min(0).default(0),
  FAL_FLUX_MODEL: z.string().default("fal-ai/flux/dev"),
  FAL_SDXL_MODEL: z.string().default("fal-ai/fast-sdxl"),
  REPLICATE_FLUX_MODEL: z.string().default("black-forest-labs/flux-dev"),
  REPLICATE_SDXL_MODEL: z.string().default("stability-ai/sdxl"),
  OPENAI_IMAGE_MODEL: z.string().default("gpt-image-1"),
  // Replicate-hosted models for the single-key (Replicate) path:
  REPLICATE_LLM_MODEL: z.string().default("meta/meta-llama-3.1-405b-instruct"),
  REPLICATE_VIDEO_MODEL: z.string().default("minimax/video-01"),

  // --- Video generation ---
  VIDEO_PROVIDER: z.enum(["runway", "kling", "pika"]).default("runway"),
  RUNWAY_API_KEY: optionalStr,
  KLING_ACCESS_KEY: optionalStr,
  KLING_SECRET_KEY: optionalStr,
  PIKA_API_KEY: optionalStr,
  RUNWAY_API_URL: z.string().default("https://api.dev.runwayml.com"),
  RUNWAY_MODEL: z.string().default("gen3a_turbo"),
  RUNWAY_VERSION: z.string().default("2024-11-06"),
  KLING_API_URL: z.string().default("https://api.klingai.com"),
  KLING_MODEL: z.string().default("kling-v1"),
  PIKA_API_URL: z.string().default("https://api.pika.art"),

  // How many image/video options to generate per segment.
  IMAGE_OPTIONS_PER_SEGMENT: z.coerce.number().int().min(1).max(5).default(5),
  VIDEO_OPTIONS_PER_SEGMENT: z.coerce.number().int().min(0).max(3).default(3),

  // --- Translation ---
  TRANSLATION_PROVIDER: z.enum(["claude", "openai"]).optional(),

  // --- Rendering ---
  FFMPEG_PATH: optionalStr,
  FFPROBE_PATH: optionalStr,
  QUALITY_MIN_SCORE: z.coerce.number().min(0).max(100).default(95),
  REMOTION_CONCURRENCY: z.coerce.number().int().positive().default(4),

  // --- Worker ---
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;
// Runtime overrides (e.g. from the DB-backed Settings page) layered over
// process.env. Authoritative for any key they contain.
let overrides: Record<string, string | undefined> = {};

/** Replace all runtime overrides (used when syncing from the Settings table). */
export function setOverrides(next: Record<string, string | undefined>): void {
  overrides = { ...next };
  cached = null;
}

/** Merge additional runtime overrides. */
export function applyOverrides(next: Record<string, string | undefined>): void {
  overrides = { ...overrides, ...next };
  cached = null;
}

/** Drop the cached parse (forces re-read on next access). */
export function refreshEnv(): void {
  cached = null;
}

/**
 * Parse & validate `process.env` once. Throws a readable aggregated error if a
 * required variable is missing or malformed.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  // Treat empty-string env vars (e.g. `CLERK_SECRET_KEY=` in .env) as unset so
  // optional fields fall back to undefined / defaults instead of failing min(1).
  const cleaned: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(source)) {
    cleaned[key] = value === "" ? undefined : value;
  }
  // Runtime overrides win for any key they contain (empty → explicitly unset).
  for (const [key, value] of Object.entries(overrides)) {
    cleaned[key] = value == null || value === "" ? undefined : value;
  }
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment configuration:\n${issues}\n\n` +
        `Copy .env.example to .env and fill in the required values.`,
    );
  }
  cached = parsed.data;
  return cached;
}

export const env: Env = /* lazy-safe */ new Proxy({} as Env, {
  get(_t, prop: string) {
    return loadEnv()[prop as keyof Env];
  },
});
