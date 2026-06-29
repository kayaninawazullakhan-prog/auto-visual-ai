import OpenAI from "openai";
import { loadEnv, MissingProviderKeyError } from "@ava/config";
import type { SegmentAnalysis } from "@ava/types";
import type { UnderstandingProvider, UnderstandingInput } from "../contracts.js";
import { SYSTEM_PROMPT, buildUserPrompt, parseAnalysis } from "./parse.js";

/** OpenAI understanding provider (JSON mode). */
export class OpenAIUnderstandingProvider implements UnderstandingProvider {
  readonly name = "openai";

  private client(): OpenAI {
    const env = loadEnv();
    if (!env.OPENAI_API_KEY) {
      throw new MissingProviderKeyError("openai", ["OPENAI_API_KEY"]);
    }
    return new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }

  async analyze(input: UnderstandingInput): Promise<SegmentAnalysis> {
    const env = loadEnv();
    const res = await this.client().chat.completions.create({
      model: env.OPENAI_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(input) },
      ],
    });
    const text = res.choices[0]?.message?.content ?? "";
    return parseAnalysis(text, input.sentence);
  }

  async translate(text: string, targetLanguage: string): Promise<string> {
    const env = loadEnv();
    const res = await this.client().chat.completions.create({
      model: env.OPENAI_MODEL,
      messages: [
        {
          role: "user",
          content: `Translate the following text to ${targetLanguage}. Return only the translation:\n\n${text}`,
        },
      ],
    });
    return (res.choices[0]?.message?.content ?? "").trim();
  }
}
