import { loadEnv, MissingProviderKeyError } from "@ava/config";
import type { SegmentAnalysis } from "@ava/types";
import type { UnderstandingProvider, UnderstandingInput } from "../contracts.js";
import { runReplicate } from "../util/replicate.js";
import { SYSTEM_PROMPT, buildUserPrompt, parseAnalysis } from "./parse.js";

function outToText(out: unknown): string {
  if (Array.isArray(out)) return out.join("");
  return typeof out === "string" ? out : JSON.stringify(out);
}

/** Understanding via a Replicate-hosted LLM (the single-key Replicate path). */
export class ReplicateUnderstandingProvider implements UnderstandingProvider {
  readonly name = "replicate-llm";

  async analyze(input: UnderstandingInput): Promise<SegmentAnalysis> {
    const env = loadEnv();
    if (!env.REPLICATE_API_TOKEN) {
      throw new MissingProviderKeyError("replicate-llm", ["REPLICATE_API_TOKEN"]);
    }
    const out = await runReplicate(env.REPLICATE_LLM_MODEL, {
      system_prompt: SYSTEM_PROMPT,
      prompt: `${buildUserPrompt(input)}\n\nRespond with ONLY the JSON object.`,
      max_tokens: 1024,
      temperature: 0.3,
    });
    return parseAnalysis(outToText(out), input.sentence);
  }

  async translate(text: string, targetLanguage: string): Promise<string> {
    const env = loadEnv();
    if (!env.REPLICATE_API_TOKEN) {
      throw new MissingProviderKeyError("replicate-llm", ["REPLICATE_API_TOKEN"]);
    }
    const out = await runReplicate(env.REPLICATE_LLM_MODEL, {
      prompt: `Translate the following text to ${targetLanguage}. Return only the translation, no quotes or notes:\n\n${text}`,
      max_tokens: 1024,
      temperature: 0.2,
    });
    return outToText(out).trim();
  }
}
