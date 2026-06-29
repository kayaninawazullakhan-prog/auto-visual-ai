import type {
  Word,
  CaptionWord,
  CaptionStyleName,
  CaptionAnimationName,
  SubtitleMeta,
} from "@ava/types";

export interface CaptionGroup {
  text: string;
  startSec: number;
  endSec: number;
  words: CaptionWord[];
}

export interface StylePreset {
  style: CaptionStyleName;
  animation: CaptionAnimationName;
  maxWords: number;
  meta: SubtitleMeta;
}

/** Caption look presets. Stored concretely on each Subtitle so the renderer
 *  just reads meta (no shared preset import on the render side). */
export const CAPTION_PRESETS: Record<CaptionStyleName, StylePreset> = {
  HORMOZI: {
    style: "HORMOZI",
    animation: "POP",
    maxWords: 4,
    meta: {
      fontFamily: "Montserrat, Arial Black, sans-serif",
      fontSizePx: 86,
      primaryColor: "#FFFFFF",
      highlightColor: "#FFE100",
      strokeColor: "#000000",
      strokeWidthPx: 9,
      uppercase: true,
      maxLines: 2,
      maxCharsPerLine: 16,
      positionY: 0.64,
    },
  },
  KARAOKE: {
    style: "KARAOKE",
    animation: "FADE",
    maxWords: 6,
    meta: {
      fontFamily: "Inter, Arial, sans-serif",
      fontSizePx: 64,
      primaryColor: "#FFFFFF",
      highlightColor: "#27E1A1",
      strokeColor: "#000000",
      strokeWidthPx: 6,
      uppercase: false,
      positionY: 0.7,
    },
  },
  TIKTOK: {
    style: "TIKTOK",
    animation: "BOUNCE",
    maxWords: 5,
    meta: {
      fontFamily: "Arial, sans-serif",
      fontSizePx: 72,
      primaryColor: "#FFFFFF",
      highlightColor: "#FF3B5C",
      strokeColor: "#000000",
      strokeWidthPx: 7,
      uppercase: true,
      positionY: 0.68,
    },
  },
  REELS: {
    style: "REELS",
    animation: "SLIDE",
    maxWords: 5,
    meta: {
      fontFamily: "Helvetica, Arial, sans-serif",
      fontSizePx: 68,
      primaryColor: "#FFFFFF",
      highlightColor: "#6C5CE7",
      strokeColor: "#000000",
      strokeWidthPx: 6,
      uppercase: false,
      positionY: 0.69,
    },
  },
  SHORTS: {
    style: "SHORTS",
    animation: "ZOOM",
    maxWords: 5,
    meta: {
      fontFamily: "Roboto, Arial, sans-serif",
      fontSizePx: 70,
      primaryColor: "#FFFFFF",
      highlightColor: "#FF0050",
      strokeColor: "#000000",
      strokeWidthPx: 7,
      uppercase: true,
      positionY: 0.68,
    },
  },
  WORD_LEVEL: {
    style: "WORD_LEVEL",
    animation: "POP",
    maxWords: 1,
    meta: {
      fontFamily: "Inter, Arial, sans-serif",
      fontSizePx: 96,
      primaryColor: "#FFFFFF",
      highlightColor: "#FFE100",
      strokeColor: "#000000",
      strokeWidthPx: 9,
      uppercase: true,
      positionY: 0.62,
    },
  },
};

function toGroup(words: Word[]): CaptionGroup {
  return {
    text: words.map((w) => w.word).join(" ").trim(),
    startSec: words[0]!.start,
    endSec: words[words.length - 1]!.end,
    words: words.map((w) => ({ word: w.word, start: w.start, end: w.end })),
  };
}

/** Chunk words into caption groups by word count, char length, duration, and
 *  sentence-ending punctuation. */
export function groupWords(
  words: Word[],
  maxWords: number,
  maxChars = 24,
  maxDurSec = 2.6,
): CaptionGroup[] {
  const groups: CaptionGroup[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length) {
      groups.push(toGroup(cur));
      cur = [];
    }
  };
  for (const w of words) {
    const tentative = [...cur, w];
    const text = tentative.map((x) => x.word).join(" ");
    const dur = w.end - (cur[0]?.start ?? w.start);
    if (cur.length > 0 && (tentative.length > maxWords || text.length > maxChars || dur > maxDurSec)) {
      flush();
    }
    cur.push(w);
    if (/[.!?]$/.test(w.word)) flush();
  }
  flush();
  return groups;
}

/** Distribute translated words evenly across a group's span (translation
 *  reorders words, so per-word source timings don't transfer). */
export function synthCaptionWords(text: string, start: number, end: number): CaptionWord[] {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const per = Math.max(end - start, 0.01) / tokens.length;
  return tokens.map((word, i) => ({
    word,
    start: +(start + i * per).toFixed(3),
    end: +(start + (i + 1) * per).toFixed(3),
  }));
}

const LANGUAGE_NAMES: Record<string, string> = {
  EN: "English",
  HI: "Hindi",
  UR: "Urdu",
  AR: "Arabic",
  ES: "Spanish",
  FR: "French",
  DE: "German",
  PT: "Portuguese",
};

export function languageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code;
}
