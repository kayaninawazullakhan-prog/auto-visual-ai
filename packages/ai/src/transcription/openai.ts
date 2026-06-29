import OpenAI from "openai";
import { createReadStream } from "node:fs";
import { loadEnv, MissingProviderKeyError } from "@ava/config";
import type { TranscriptResult, Word } from "@ava/types";
import type { TranscriptionProvider, TranscribeInput } from "../contracts.js";
import { fillWords } from "./util.js";

interface OpenAIVerboseWord {
  word: string;
  start: number;
  end: number;
}
interface OpenAIVerboseSegment {
  start: number;
  end: number;
  text: string;
}

/** OpenAI hosted Whisper (whisper-1) with word + segment timestamps. */
export class OpenAIWhisperProvider implements TranscriptionProvider {
  readonly name = "openai-whisper";

  async transcribe(input: TranscribeInput): Promise<TranscriptResult> {
    const env = loadEnv();
    if (!env.OPENAI_API_KEY) {
      throw new MissingProviderKeyError("openai-whisper", ["OPENAI_API_KEY"]);
    }
    if (!input.audioPath) {
      throw new Error("OpenAI Whisper requires a local audioPath");
    }

    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const res = (await client.audio.transcriptions.create({
      file: createReadStream(input.audioPath),
      model: env.WHISPER_MODEL,
      response_format: "verbose_json",
      timestamp_granularities: ["word", "segment"],
      ...(input.language ? { language: input.language } : {}),
    })) as unknown as {
      text?: string;
      language?: string;
      words?: OpenAIVerboseWord[];
      segments?: OpenAIVerboseSegment[];
    };

    const allWords: Word[] = (res.words ?? []).map((w) => ({
      word: w.word,
      start: w.start,
      end: w.end,
    }));

    const rawSegments = res.segments ?? [];
    const segments = (
      rawSegments.length > 0
        ? rawSegments.map((s, i) => ({
            index: i,
            text: (s.text ?? "").trim(),
            start: s.start,
            end: s.end,
            // Words whose start falls inside this segment's span.
            words: allWords.filter(
              (w) => w.start >= s.start - 1e-3 && w.start < s.end + 1e-3,
            ),
          }))
        : [
            {
              index: 0,
              text: (res.text ?? "").trim(),
              start: allWords[0]?.start ?? 0,
              end: allWords[allWords.length - 1]?.end ?? 0,
              words: allWords,
            },
          ]
    );

    fillWords(segments);
    return {
      language: normalizeLanguage(res.language),
      text: res.text ?? "",
      segments,
    };
  }
}

/** OpenAI sometimes returns a language name ("english"); normalize to a code. */
function normalizeLanguage(lang?: string): string {
  if (!lang) return "en";
  const map: Record<string, string> = {
    english: "en",
    hindi: "hi",
    urdu: "ur",
    arabic: "ar",
    spanish: "es",
    french: "fr",
    german: "de",
    portuguese: "pt",
  };
  return map[lang.toLowerCase()] ?? lang.toLowerCase();
}
