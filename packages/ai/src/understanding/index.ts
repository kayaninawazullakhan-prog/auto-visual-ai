import { loadEnv } from "@ava/config";
import type { UnderstandingProvider } from "../contracts.js";
import { ClaudeUnderstandingProvider } from "./claude.js";
import { OpenAIUnderstandingProvider } from "./openai.js";
import { ReplicateUnderstandingProvider } from "./replicate.js";

/**
 * Resolve the understanding provider. Honors UNDERSTANDING_PROVIDER when its key
 * is present, otherwise auto-falls-back to whatever single key is configured
 * (Anthropic → OpenAI → Replicate) so one key runs the platform.
 */
export function getUnderstandingProvider(): UnderstandingProvider {
  const env = loadEnv();
  const p = env.UNDERSTANDING_PROVIDER;
  if (p === "openai" && env.OPENAI_API_KEY) return new OpenAIUnderstandingProvider();
  if (p === "claude" && env.ANTHROPIC_API_KEY) return new ClaudeUnderstandingProvider();
  if (env.ANTHROPIC_API_KEY) return new ClaudeUnderstandingProvider();
  if (env.OPENAI_API_KEY) return new OpenAIUnderstandingProvider();
  if (env.REPLICATE_API_TOKEN) return new ReplicateUnderstandingProvider();
  // Nothing configured — return the nominal choice; it throws a clear error on use.
  return p === "openai" ? new OpenAIUnderstandingProvider() : new ClaudeUnderstandingProvider();
}

/** Translation provider: TRANSLATION_PROVIDER override, else the understanding one. */
export function getTranslationProvider(): UnderstandingProvider {
  const env = loadEnv();
  if (env.TRANSLATION_PROVIDER === "openai" && env.OPENAI_API_KEY) return new OpenAIUnderstandingProvider();
  if (env.TRANSLATION_PROVIDER === "claude" && env.ANTHROPIC_API_KEY) return new ClaudeUnderstandingProvider();
  return getUnderstandingProvider();
}

export { ClaudeUnderstandingProvider, OpenAIUnderstandingProvider, ReplicateUnderstandingProvider };
