/**
 * Provider contracts — the narrow interfaces every AI adapter implements.
 *
 * Concrete adapters (OpenAI Whisper, Claude, Flux, SDXL, Runway, Kling, Pika)
 * are implemented in Phases 2–4. Defining the contracts here in Phase 0 lets the
 * worker and registry be written against stable types, and makes providers
 * swappable via env (see @ava/config getFeatures).
 */
import type {
  GeneratedImage,
  GeneratedVideo,
  GenerationOptions,
  SegmentAnalysis,
  TranscriptResult,
  Word,
} from "@ava/types";

export interface TranscribeInput {
  /** Local file path to the audio (used by OpenAI + local providers). */
  audioPath?: string;
  /** Publicly reachable URL to the audio (used by Replicate). */
  audioUrl?: string;
  /** ISO-639-1 hint; omit to auto-detect. */
  language?: string;
  /** Request word-level timestamps (always true for this product). */
  wordTimestamps?: boolean;
}

export interface TranscriptionProvider {
  readonly name: string;
  transcribe(input: TranscribeInput): Promise<TranscriptResult>;
}

export interface UnderstandingInput {
  sentence: string;
  /** Surrounding sentences for better context. */
  context?: string;
  words?: Word[];
}

export interface UnderstandingProvider {
  readonly name: string;
  analyze(input: UnderstandingInput): Promise<SegmentAnalysis>;
  /** Optional translation hook used by the multi-language subtitle engine. */
  translate?(text: string, targetLanguage: string): Promise<string>;
}

export interface ImageProvider {
  readonly name: string;
  generate(prompt: string, opts?: GenerationOptions): Promise<GeneratedImage>;
}

export interface VideoProvider {
  readonly name: string;
  generate(prompt: string, opts?: GenerationOptions): Promise<GeneratedVideo>;
}
