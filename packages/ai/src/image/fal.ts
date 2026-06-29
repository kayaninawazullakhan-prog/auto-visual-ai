import { loadEnv, MissingProviderKeyError } from "@ava/config";
import type { GeneratedImage, GenerationOptions } from "@ava/types";
import type { ImageProvider } from "../contracts.js";

function falSize(aspect?: GenerationOptions["aspectRatio"]): string {
  switch (aspect) {
    case "16:9":
      return "landscape_16_9";
    case "1:1":
      return "square_hd";
    case "9:16":
    default:
      return "portrait_16_9"; // 9:16 vertical
  }
}

/** fal.ai image provider (Flux / SDXL). Synchronous fal.run endpoint. */
export class FalImageProvider implements ImageProvider {
  constructor(
    private readonly model: string,
    readonly name: string,
  ) {}

  async generate(prompt: string, opts?: GenerationOptions): Promise<GeneratedImage> {
    const env = loadEnv();
    if (!env.FAL_KEY) throw new MissingProviderKeyError(this.name, ["FAL_KEY"]);

    const res = await fetch(`https://fal.run/${this.model}`, {
      method: "POST",
      headers: { Authorization: `Key ${env.FAL_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        image_size: falSize(opts?.aspectRatio),
        num_images: 1,
        enable_safety_checker: true,
        ...(opts?.seed != null ? { seed: opts.seed } : {}),
        ...(opts?.negativePrompt ? { negative_prompt: opts.negativePrompt } : {}),
      }),
    });
    if (!res.ok) throw new Error(`fal ${this.model} failed (${res.status}): ${await res.text()}`);

    const data = (await res.json()) as {
      images?: Array<{ url: string; width?: number; height?: number }>;
      seed?: number;
    };
    const img = data.images?.[0];
    if (!img?.url) throw new Error(`fal ${this.model} returned no image`);

    return {
      url: img.url,
      width: img.width ?? 0,
      height: img.height ?? 0,
      seed: data.seed,
      meta: { model: this.model, seed: data.seed },
    };
  }
}
