import { loadEnv, MissingProviderKeyError } from "@ava/config";
import type { GeneratedVideo, GenerationOptions } from "@ava/types";
import type { VideoProvider } from "../contracts.js";
import { runReplicate } from "../util/replicate.js";

/**
 * Video via a Replicate-hosted model (default minimax/video-01). Text-to-video,
 * with an optional first-frame seed image. Accepts data-URI seeds, so it works
 * with local storage (no public URL needed) — the single-key Replicate path.
 */
export class ReplicateVideoProvider implements VideoProvider {
  readonly name = "replicate-video";

  async generate(prompt: string, opts?: GenerationOptions): Promise<GeneratedVideo> {
    const env = loadEnv();
    if (!env.REPLICATE_API_TOKEN) {
      throw new MissingProviderKeyError("replicate-video", ["REPLICATE_API_TOKEN"]);
    }
    const input: Record<string, unknown> = { prompt };
    if (opts?.imageUrl) input.first_frame_image = opts.imageUrl;

    const out = await runReplicate(env.REPLICATE_VIDEO_MODEL, input, {
      timeoutMs: 20 * 60 * 1000,
    });
    const url = Array.isArray(out) ? (out[0] as string) : (out as string);
    if (!url || typeof url !== "string") throw new Error("Replicate video returned no URL");

    return {
      url,
      width: opts?.width ?? 0,
      height: opts?.height ?? 0,
      durationSec: opts?.durationSec ?? 6,
      meta: { model: env.REPLICATE_VIDEO_MODEL },
    };
  }
}
