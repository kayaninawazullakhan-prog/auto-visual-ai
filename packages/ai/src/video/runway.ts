import { loadEnv, MissingProviderKeyError } from "@ava/config";
import type { GeneratedVideo, GenerationOptions } from "@ava/types";
import type { VideoProvider } from "../contracts.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function runwayRatio(aspect?: GenerationOptions["aspectRatio"]): string {
  if (aspect === "16:9") return "1280:768";
  return "768:1280"; // vertical default
}

/**
 * Runway Gen-3 image-to-video. Requires a seed image (opts.imageUrl) — the
 * generate-assets stage feeds it the segment's first generated image.
 */
export class RunwayVideoProvider implements VideoProvider {
  readonly name = "runway";

  async generate(prompt: string, opts?: GenerationOptions): Promise<GeneratedVideo> {
    const env = loadEnv();
    if (!env.RUNWAY_API_KEY) throw new MissingProviderKeyError("runway", ["RUNWAY_API_KEY"]);
    if (!opts?.imageUrl) {
      throw new Error("Runway is image-to-video: a seed image URL (opts.imageUrl) is required");
    }

    const headers = {
      Authorization: `Bearer ${env.RUNWAY_API_KEY}`,
      "X-Runway-Version": env.RUNWAY_VERSION,
      "Content-Type": "application/json",
    };

    const created = await fetch(`${env.RUNWAY_API_URL}/v1/image_to_video`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: env.RUNWAY_MODEL,
        promptImage: opts.imageUrl,
        promptText: prompt,
        ratio: runwayRatio(opts.aspectRatio),
        duration: Math.round(opts.durationSec ?? 5),
      }),
    });
    if (!created.ok) throw new Error(`Runway create failed (${created.status}): ${await created.text()}`);
    const { id } = (await created.json()) as { id: string };

    const deadline = Date.now() + 15 * 60 * 1000;
    while (true) {
      if (Date.now() > deadline) throw new Error("Runway task timed out");
      await sleep(3000);
      const task = (await (
        await fetch(`${env.RUNWAY_API_URL}/v1/tasks/${id}`, { headers })
      ).json()) as { status: string; output?: string[]; failure?: string };

      if (task.status === "SUCCEEDED") {
        const url = task.output?.[0];
        if (!url) throw new Error("Runway succeeded but returned no output");
        return {
          url,
          width: opts.width ?? 0,
          height: opts.height ?? 0,
          durationSec: opts.durationSec ?? 5,
          meta: { model: env.RUNWAY_MODEL, providerRequestId: id },
        };
      }
      if (task.status === "FAILED") throw new Error(`Runway task failed: ${task.failure ?? "unknown"}`);
    }
  }
}
