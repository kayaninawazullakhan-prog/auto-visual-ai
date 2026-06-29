import Anthropic from "@anthropic-ai/sdk";
import { loadEnv, MissingProviderKeyError } from "@ava/config";
import type { SegmentAnalysis } from "@ava/types";
import type { UnderstandingProvider, UnderstandingInput } from "../contracts.js";
import { SYSTEM_PROMPT, buildUserPrompt, parseAnalysis } from "./parse.js";

/** Anthropic Claude understanding provider. */
export class ClaudeUnderstandingProvider implements UnderstandingProvider {
  readonly name = "claude";

  private client(): Anthropic {
    const env = loadEnv();
    if (!env.ANTHROPIC_API_KEY) {
      throw new MissingProviderKeyError("claude", ["ANTHROPIC_API_KEY"]);
    }
    return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }

  async analyze(input: UnderstandingInput): Promise<SegmentAnalysis> {
    const env = loadEnv();
    const res = await this.client().messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(input) }],
    });
    const text = res.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");
    return parseAnalysis(text, input.sentence);
  }

  async translate(text: string, targetLanguage: string): Promise<string> {
    const env = loadEnv();
    const res = await this.client().messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Translate the following text to ${targetLanguage}. Return only the translation, nothing else:\n\n${text}`,
        },
      ],
    });
    return res.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();
  }
}
