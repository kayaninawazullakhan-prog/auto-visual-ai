import type { VisualIdea, AssetStyleName } from "@ava/types";

/**
 * Prompt Engine — expands a concise visual idea into a detailed, provider-ready
 * generation prompt, styled per the requested aesthetic. Pure + deterministic.
 *
 * Example:
 *   idea "AI helps doctors detect cancer" + PHOTOREALISTIC →
 *   "A doctor reviewing AI-assisted cancer diagnostics on a modern medical
 *    dashboard in a hospital, photorealistic, ultra-detailed, natural lighting,
 *    realistic human expressions, sharp focus, high detail, 4K, vertical 9:16"
 */

const STYLE_DESCRIPTORS: Record<AssetStyleName, string> = {
  PHOTOREALISTIC:
    "photorealistic, ultra-detailed, natural lighting, realistic textures, realistic human expressions",
  ULTRA_REALISTIC:
    "ultra realistic, hyper-detailed, lifelike, 8k detail, true-to-life materials",
  CINEMATIC:
    "cinematic, dramatic lighting, shallow depth of field, anamorphic, subtle film grain, color graded",
  DOCUMENTARY:
    "documentary photography, candid, available natural light, photojournalistic, authentic",
  COMMERCIAL:
    "commercial photography, clean composition, studio lighting, polished, high-end advertising look",
  B_ROLL: "cinematic b-roll, establishing shot, smooth gentle camera motion",
  MOTION_GRAPHICS:
    "modern motion graphics, clean vector shapes, bold minimal design, animated infographic",
};

const QUALITY_SUFFIX = "sharp focus, high detail, 4K, vertical composition 9:16";
const NEGATIVE = "no text, no watermark, no logos, no distorted faces, no extra limbs";

/** Default 5 image styles (Image Generation Engine: 5 options/segment). */
export const DEFAULT_IMAGE_STYLES: AssetStyleName[] = [
  "PHOTOREALISTIC",
  "ULTRA_REALISTIC",
  "CINEMATIC",
  "DOCUMENTARY",
  "COMMERCIAL",
];

/** Default 3 video styles (Video Generation Engine: 3 options/segment). */
export const DEFAULT_VIDEO_STYLES: AssetStyleName[] = [
  "CINEMATIC",
  "DOCUMENTARY",
  "B_ROLL",
];

export interface PromptContext {
  /** Topic / surrounding context to enrich the scene. */
  topic?: string;
}

export function buildImagePrompt(
  idea: Pick<VisualIdea, "description">,
  style: AssetStyleName,
  ctx?: PromptContext,
): string {
  const subject = idea.description.trim().replace(/\.$/, "");
  const topical = ctx?.topic ? `, theme: ${ctx.topic}` : "";
  return `${subject}${topical}, ${STYLE_DESCRIPTORS[style]}, ${QUALITY_SUFFIX}`;
}

export function buildVideoPrompt(
  idea: Pick<VisualIdea, "description">,
  style: AssetStyleName,
  ctx?: PromptContext,
): string {
  const subject = idea.description.trim().replace(/\.$/, "");
  const topical = ctx?.topic ? `, theme: ${ctx.topic}` : "";
  return `${subject}${topical}, ${STYLE_DESCRIPTORS[style]}, smooth cinematic camera movement, high bitrate, no blur, no artifacts, ${QUALITY_SUFFIX}`;
}

export interface PromptOption {
  style: AssetStyleName;
  prompt: string;
}

/** Build one prompt per style for an idea (used to generate option sets). */
export function buildImagePromptOptions(
  idea: Pick<VisualIdea, "description">,
  styles: AssetStyleName[] = DEFAULT_IMAGE_STYLES,
  ctx?: PromptContext,
): PromptOption[] {
  return styles.map((style) => ({ style, prompt: buildImagePrompt(idea, style, ctx) }));
}

export function buildVideoPromptOptions(
  idea: Pick<VisualIdea, "description">,
  styles: AssetStyleName[] = DEFAULT_VIDEO_STYLES,
  ctx?: PromptContext,
): PromptOption[] {
  return styles.map((style) => ({ style, prompt: buildVideoPrompt(idea, style, ctx) }));
}

export { NEGATIVE as NEGATIVE_PROMPT };
