import { loadEnv, MissingProviderKeyError } from "@ava/config";
import type { ImageProvider } from "../contracts.js";
import { FalImageProvider } from "./fal.js";
import { ReplicateImageProvider } from "./replicate.js";
import { OpenAIImageProvider } from "./openai.js";

type ImageEnum = "FLUX" | "SDXL" | "OPENAI_IMAGE";
interface ImagePick {
  provider: ImageProvider;
  enum: ImageEnum;
}

/**
 * Resolve the image provider. Honors IMAGE_PROVIDER when a compatible key is
 * present (fal → Replicate for Flux/SDXL), otherwise falls back to any image key
 * (fal → Replicate → OpenAI) so a single key runs image generation.
 */
function pickImageProvider(): ImagePick {
  const env = loadEnv();
  const p = env.IMAGE_PROVIDER;

  if (p === "openai" && env.OPENAI_API_KEY) {
    return { provider: new OpenAIImageProvider(), enum: "OPENAI_IMAGE" };
  }
  if (p === "flux" || p === "sdxl") {
    const enumValue: ImageEnum = p === "sdxl" ? "SDXL" : "FLUX";
    if (env.FAL_KEY) {
      const model = p === "sdxl" ? env.FAL_SDXL_MODEL : env.FAL_FLUX_MODEL;
      return { provider: new FalImageProvider(model, p), enum: enumValue };
    }
    if (env.REPLICATE_API_TOKEN) {
      const model = p === "sdxl" ? env.REPLICATE_SDXL_MODEL : env.REPLICATE_FLUX_MODEL;
      return { provider: new ReplicateImageProvider(model, p, p), enum: enumValue };
    }
  }

  // Fallback: any configured image key.
  if (env.FAL_KEY) return { provider: new FalImageProvider(env.FAL_FLUX_MODEL, "flux"), enum: "FLUX" };
  if (env.REPLICATE_API_TOKEN) {
    return { provider: new ReplicateImageProvider(env.REPLICATE_FLUX_MODEL, "flux", "flux"), enum: "FLUX" };
  }
  if (env.OPENAI_API_KEY) return { provider: new OpenAIImageProvider(), enum: "OPENAI_IMAGE" };

  throw new MissingProviderKeyError("image", ["OPENAI_API_KEY", "FAL_KEY", "REPLICATE_API_TOKEN"]);
}

export function getImageProvider(): ImageProvider {
  return pickImageProvider().provider;
}

export function imageProviderEnum(): ImageEnum {
  return pickImageProvider().enum;
}

export { FalImageProvider, ReplicateImageProvider, OpenAIImageProvider };
