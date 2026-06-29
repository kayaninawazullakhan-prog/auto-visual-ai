import { MissingProviderKeyError, loadEnv } from "@ava/config";
import type { GeneratedImage, GenerationOptions } from "@ava/types";
import type { ImageProvider } from "../contracts.js";
import { runReplicate } from "../util/replicate.js";

function dims(opts?: GenerationOptions): { width: number; height: number } {
  if (opts?.width && opts?.height) return { width: opts.width, height: opts.height };
  switch (opts?.aspectRatio) {
    case "16:9":
      return { width: 1344, height: 768 };
    case "1:1":
      return { width: 1024, height: 1024 };
    case "9:16":
    default:
      return { width: 768, height: 1344 };
  }
}

/** Replicate image provider — input shape differs by family (flux vs sdxl). */
export class ReplicateImageProvider implements ImageProvider {
  constructor(
    private readonly model: string,
    private readonly family: "flux" | "sdxl",
    readonly name: string,
  ) {}

  async generate(prompt: string, opts?: GenerationOptions): Promise<GeneratedImage> {
    if (!loadEnv().REPLICATE_API_TOKEN) {
      throw new MissingProviderKeyError(this.name, ["REPLICATE_API_TOKEN"]);
    }
    const { width, height } = dims(opts);
    const input =
      this.family === "flux"
        ? { prompt, aspect_ratio: opts?.aspectRatio ?? "9:16", output_format: "png" }
        : {
            prompt,
            width,
            height,
            ...(opts?.negativePrompt ? { negative_prompt: opts.negativePrompt } : {}),
          };

    const output = await runReplicate(this.model, input);
    const url = Array.isArray(output) ? (output[0] as string) : (output as string);
    if (!url || typeof url !== "string") throw new Error("Replicate returned no image URL");

    return { url, width, height, seed: opts?.seed, meta: { model: this.model } };
  }
}
