import { loadEnv } from "@ava/config";
import type { TranscriptionProvider } from "../contracts.js";
import { OpenAIWhisperProvider } from "./openai.js";
import { ReplicateWhisperProvider } from "./replicate.js";
import { LocalWhisperProvider } from "./local.js";

/**
 * Resolve the transcription provider. Honors WHISPER_PROVIDER when its key is
 * present, otherwise falls back to whatever is configured (OpenAI → Replicate →
 * local) so a single key runs transcription.
 */
export function getTranscriptionProvider(): TranscriptionProvider {
  const env = loadEnv();
  const p = env.WHISPER_PROVIDER;
  if (p === "openai" && env.OPENAI_API_KEY) return new OpenAIWhisperProvider();
  if (p === "replicate" && env.REPLICATE_API_TOKEN) return new ReplicateWhisperProvider();
  if (p === "local") return new LocalWhisperProvider();
  if (env.OPENAI_API_KEY) return new OpenAIWhisperProvider();
  if (env.REPLICATE_API_TOKEN) return new ReplicateWhisperProvider();
  return new LocalWhisperProvider();
}

export { OpenAIWhisperProvider, ReplicateWhisperProvider, LocalWhisperProvider };
