import OpenAI from "openai";
import { loadEnv, MissingProviderKeyError } from "@ava/config";
import type { GeneratedImage, GenerationOptions } from "@ava/types";
import type { ImageProvider } from "../contracts.js";

function openaiSize(aspect?: GenerationOptions["aspectRatio"]): "1024x1024" | "1024x1536" | "1536x1024" {
  switch (aspect) {
    case "16:9":
      return "1536x1024";
    case "1:1":
      return "1024x1024";
    case "9:16":
    default:
      return "1024x1536"; // vertical
  }
}

/** OpenAI Images provider (gpt-image-1 / dall-e-3). */
export class OpenAIImageProvider implements ImageProvider {
  readonly name = "openai-image";

  async generate(prompt: string, opts?: GenerationOptions): Promise<GeneratedImage> {
    const env = loadEnv();
    if (!env.OPENAI_API_KEY) throw new MissingProviderKeyError(this.name, ["OPENAI_API_KEY"]);

    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const size = openaiSize(opts?.aspectRatio);
    const res = await client.images.generate({
      model: env.OPENAI_IMAGE_MODEL,
      prompt,
      size,
      n: 1,
    });

    const item = res.data?.[0];
    // gpt-image-1 returns base64; dall-e-3 returns a URL.
    const url = item?.url ?? (item?.b64_json ? `data:image/png;base64,${item.b64_json}` : undefined);
    if (!url) throw new Error("OpenAI Images returned no image");

    const [w, h] = size.split("x").map(Number);
    return { url, width: w!, height: h!, meta: { model: env.OPENAI_IMAGE_MODEL } };
  }
}
