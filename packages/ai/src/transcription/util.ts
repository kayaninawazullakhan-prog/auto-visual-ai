import type { TranscriptResult, Word } from "@ava/types";

export function num(v: unknown, fallback = 0): number {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * When a provider returns segment text without word timings, distribute words
 * evenly across the segment span so word-level sync still works (approximate).
 */
export function synthWords(text: string, start: number, end: number): Word[] {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const span = Math.max(end - start, 0.01);
  const per = span / tokens.length;
  return tokens.map((word, i) => ({
    word,
    start: +(start + i * per).toFixed(3),
    end: +(start + (i + 1) * per).toFixed(3),
  }));
}

/** Ensure every segment has at least synthesized word timings. */
export function fillWords(
  segments: TranscriptResult["segments"],
): TranscriptResult["segments"] {
  for (const seg of segments) {
    if (!seg.words || seg.words.length === 0) {
      seg.words = synthWords(seg.text, seg.start, seg.end);
    }
  }
  return segments;
}

interface WhisperxWord {
  word?: string;
  text?: string;
  start?: number;
  end?: number;
  score?: number;
}
interface WhisperxSegment {
  start?: number;
  end?: number;
  text?: string;
  words?: WhisperxWord[];
}
interface WhisperxOutput {
  segments?: WhisperxSegment[];
  detected_language?: string;
  language?: string;
}

/** Parse the WhisperX JSON shape (Replicate + local CLI share it). */
export function parseWhisperx(output: unknown, languageHint?: string): TranscriptResult {
  const data = (output ?? {}) as WhisperxOutput;
  const segs = data.segments ?? [];
  const segments = segs.map((s, i) => {
    const start = num(s.start);
    const end = num(s.end, start);
    const words: Word[] = (s.words ?? [])
      .map((w) => ({
        word: (w.word ?? w.text ?? "").trim(),
        start: num(w.start, start),
        end: num(w.end, end),
        confidence: typeof w.score === "number" ? w.score : undefined,
      }))
      .filter((w) => w.word.length > 0);
    return { index: i, text: (s.text ?? "").trim(), start, end, words };
  });
  fillWords(segments);
  const text = segments.map((s) => s.text).join(" ").trim();
  return {
    language: data.detected_language ?? data.language ?? languageHint ?? "en",
    text,
    segments,
  };
}

interface WhisperCppSegment {
  offsets?: { from?: number; to?: number };
  text?: string;
}
interface WhisperCppOutput {
  result?: { language?: string };
  transcription?: WhisperCppSegment[];
}

/** Parse whisper.cpp (`-oj`) JSON. Segment offsets are in milliseconds; words
 *  are synthesized across each segment span (whisper.cpp gives segment timing). */
export function parseWhisperCpp(output: unknown, languageHint?: string): TranscriptResult {
  const data = (output ?? {}) as WhisperCppOutput;
  const segments = (data.transcription ?? [])
    .map((s) => {
      const start = num(s.offsets?.from) / 1000;
      const end = num(s.offsets?.to, num(s.offsets?.from)) / 1000;
      return { text: (s.text ?? "").trim(), start, end };
    })
    .filter((s) => s.text.length > 0)
    .map((s, i) => ({
      index: i,
      text: s.text,
      start: s.start,
      end: s.end,
      words: synthWords(s.text, s.start, s.end),
    }));
  const text = segments.map((s) => s.text).join(" ").trim();
  return {
    language: data.result?.language ?? languageHint ?? "en",
    text,
    segments,
  };
}
