import type {
  SegmentAnalysis,
  KeywordKindName,
  AssetStyleName,
  VisualIdea,
  EmotionTag,
} from "@ava/types";
import type { UnderstandingInput } from "../contracts.js";

export const KEYWORD_KINDS: KeywordKindName[] = [
  "KEYWORD",
  "ENTITY",
  "OBJECT",
  "LOCATION",
  "ACTION",
  "EMOTION",
];

export const ASSET_STYLES: AssetStyleName[] = [
  "PHOTOREALISTIC",
  "ULTRA_REALISTIC",
  "CINEMATIC",
  "DOCUMENTARY",
  "COMMERCIAL",
  "B_ROLL",
  "MOTION_GRAPHICS",
];

const ASSET_KINDS = ["IMAGE", "VIDEO", "ANIMATION", "MOTION_GRAPHIC"] as const;

/** System instruction shared by both LLM providers. */
export const SYSTEM_PROMPT = `You are an expert short-form video editor and content analyst.
You will be given ONE spoken sentence from a talking-head video (with optional surrounding context).
Analyze it for automated B-roll / visual generation and respond with ONLY a JSON object — no prose, no markdown fences.

The JSON must match exactly:
{
  "topic": string,                 // the single main topic of the sentence
  "intent": string,                // why the speaker says this (inform, persuade, hook, explain, ...)
  "meaning": string,               // one-sentence plain restatement
  "context": string,               // how it fits the surrounding speech
  "keywords": [                     // 2-8 salient terms
    { "text": string, "kind": "KEYWORD"|"ENTITY"|"OBJECT"|"LOCATION"|"ACTION"|"EMOTION", "confidence": number }
  ],
  "emotions": [ { "label": string, "score": number } ],   // 0-3 emotions, score 0..1
  "visualIdeas": [                  // 1-3 strong B-roll ideas to overlay while this is spoken
    {
      "description": string,        // concrete, filmable scene (no text overlays)
      "assetKind": "IMAGE"|"VIDEO"|"ANIMATION"|"MOTION_GRAPHIC",
      "styles": ["PHOTOREALISTIC"|"ULTRA_REALISTIC"|"CINEMATIC"|"DOCUMENTARY"|"COMMERCIAL"|"B_ROLL"|"MOTION_GRAPHICS"],
      "anchorPhrase": string,       // EXACT substring of the sentence where the visual should appear
      "priority": number            // 0..1, how strongly this visual fits
    }
  ]
}
All confidence/score/priority values are between 0 and 1. Prefer concrete, literal visuals over abstract ones.`;

export function buildUserPrompt(input: UnderstandingInput): string {
  const lines: string[] = [];
  if (input.context) lines.push(`Surrounding speech: "${input.context}"`);
  lines.push(`Sentence to analyze: "${input.sentence}"`);
  lines.push(
    `Each anchorPhrase MUST be an exact substring of the sentence so the visual can be time-synced to those words.`,
  );
  return lines.join("\n");
}

/** Extract the first JSON object from a model response (tolerates stray text). */
function extractJson(raw: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Model response did not contain JSON");
  }
  return JSON.parse(raw.slice(start, end + 1));
}

const clamp01 = (n: unknown, fallback = 0.5): number => {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(0, Math.min(1, x));
};

const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;

/** Normalize a raw model object into a safe, fully-typed SegmentAnalysis. */
export function parseAnalysis(raw: string, fallbackSentence: string): SegmentAnalysis {
  const data = extractJson(raw) as Record<string, unknown>;

  const keywords = Array.isArray(data.keywords)
    ? (data.keywords as Record<string, unknown>[])
        .map((k) => ({
          text: str(k.text).trim(),
          kind: (KEYWORD_KINDS.includes(k.kind as KeywordKindName)
            ? k.kind
            : "KEYWORD") as KeywordKindName,
          confidence: clamp01(k.confidence, 0.7),
        }))
        .filter((k) => k.text.length > 0)
    : [];

  const emotions: EmotionTag[] = Array.isArray(data.emotions)
    ? (data.emotions as Record<string, unknown>[])
        .map((e) => ({ label: str(e.label).trim(), score: clamp01(e.score, 0.5) }))
        .filter((e) => e.label.length > 0)
    : [];

  const visualIdeas: VisualIdea[] = Array.isArray(data.visualIdeas)
    ? (data.visualIdeas as Record<string, unknown>[])
        .map((v) => {
          const styles = Array.isArray(v.styles)
            ? (v.styles as unknown[]).filter((s): s is AssetStyleName =>
                ASSET_STYLES.includes(s as AssetStyleName),
              )
            : [];
          const assetKind = (ASSET_KINDS.includes(v.assetKind as never)
            ? v.assetKind
            : "IMAGE") as VisualIdea["assetKind"];
          return {
            description: str(v.description).trim(),
            assetKind,
            styles: styles.length > 0 ? styles : (["PHOTOREALISTIC"] as AssetStyleName[]),
            anchorPhrase: str(v.anchorPhrase).trim() || undefined,
            priority: clamp01(v.priority, 0.6),
          };
        })
        .filter((v) => v.description.length > 0)
    : [];

  return {
    topic: str(data.topic).trim() || "general",
    intent: str(data.intent).trim(),
    meaning: str(data.meaning, fallbackSentence).trim(),
    context: str(data.context).trim(),
    keywords,
    emotions,
    visualIdeas,
  };
}
