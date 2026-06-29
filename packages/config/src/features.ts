import { loadEnv } from "./env.js";

/**
 * Runtime feature detection. Engines auto-route to whatever key is present
 * (see @ava/ai registries), so a feature is "ready" if ANY provider that can
 * power it is configured. This is what lets a single API key run the platform:
 *   • one OpenAI key  → transcription + understanding + translation + images
 *   • one Replicate token → transcription + understanding + images + video
 * Storage defaults to local disk, so it needs no keys at all.
 */
export function getFeatures(source = loadEnv()) {
  const has = (...vals: Array<string | undefined>) => vals.every(Boolean);

  const hasOpenAI = !!source.OPENAI_API_KEY;
  const hasAnthropic = !!source.ANTHROPIC_API_KEY;
  const hasReplicate = !!source.REPLICATE_API_TOKEN;
  const hasFal = !!source.FAL_KEY;

  // Storage: local disk is always available; only "forced s3" needs AWS keys.
  const s3Configured = has(source.AWS_ACCESS_KEY_ID, source.AWS_SECRET_ACCESS_KEY, source.S3_BUCKET);
  const storage = source.STORAGE_DRIVER === "s3" ? s3Configured : true;

  return {
    auth: has(source.CLERK_SECRET_KEY, source.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY),
    billing: has(source.STRIPE_SECRET_KEY),
    storage,
    transcription: hasOpenAI || hasReplicate || source.WHISPER_PROVIDER === "local",
    understanding: hasAnthropic || hasOpenAI || hasReplicate,
    imageGeneration: hasOpenAI || hasFal || hasReplicate,
    // Video is opt-in: off unless VIDEO_OPTIONS_PER_SEGMENT > 0 AND a dedicated
    // video provider key is set. Visuals are AI images (with Ken Burns) by default.
    videoGeneration:
      source.VIDEO_OPTIONS_PER_SEGMENT > 0 &&
      (!!source.RUNWAY_API_KEY ||
        has(source.KLING_ACCESS_KEY, source.KLING_SECRET_KEY) ||
        !!source.PIKA_API_KEY),
  } as const;
}

export type Features = ReturnType<typeof getFeatures>;

/** Thrown by an adapter when the selected provider's key is missing. */
export class MissingProviderKeyError extends Error {
  constructor(
    public readonly provider: string,
    public readonly requiredEnv: string[],
  ) {
    super(
      `Provider "${provider}" is not configured. Set ${requiredEnv.join(", ")} in your .env (or the Settings page) to enable it.`,
    );
    this.name = "MissingProviderKeyError";
  }
}
