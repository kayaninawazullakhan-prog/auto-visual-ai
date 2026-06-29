import type { Job } from "@ava/queue";
import type { AnalyzeJob, Word, VisualIdea } from "@ava/types";
import { prisma, Prisma, Language, ProcessingStage } from "@ava/db";
import { getUnderstandingProvider, getTranslationProvider } from "@ava/ai";
import { pipeline } from "@ava/queue";
import { withJob } from "../lib/run-job.js";
import { mapLimit } from "../lib/concurrency.js";
import { logger } from "../lib/logger.js";

/**
 * Steps 5–8 — analyze every sentence: topic, intent, keywords/entities,
 * emotions, and visual ideas. Resolves each visual idea's anchor phrase to exact
 * word timings, persists Topic/Keyword rows + segment analysis, then chains to
 * asset generation.
 */
export async function analyze(job: Job<AnalyzeJob>) {
  const { projectId } = job.data;
  return withJob(projectId, "ANALYZE", async (setProgress) => {
    const transcript = await prisma.transcript.findUnique({
      where: { projectId },
      include: { segments: { orderBy: { index: "asc" } } },
    });
    if (!transcript || transcript.segments.length === 0) {
      throw new Error("No transcript available to analyze");
    }

    // Fresh start: clear previous analysis artifacts for this project.
    await prisma.$transaction([
      prisma.topic.deleteMany({ where: { projectId } }),
      prisma.keyword.deleteMany({ where: { projectId } }),
    ]);

    const provider = getUnderstandingProvider();
    const translator = getTranslationProvider();
    const segments = transcript.segments;
    // Decide from the detected language CODE (e.g. "te", "hi") — the Language enum
    // only covers a few languages and would mis-map e.g. Telugu to EN.
    const detected = (transcript.detectedLanguage ?? "").toLowerCase();
    const isEnglish = detected
      ? detected.startsWith("en")
      : transcript.language === Language.EN;

    // Pass 1 — English text for every segment (translate non-English audio).
    // All AI understanding + the default captions run on English.
    const englishTexts = new Array<string>(segments.length);
    if (isEnglish) {
      segments.forEach((s, i) => (englishTexts[i] = s.text));
    } else {
      await mapLimit(segments, 5, async (seg, i) => {
        englishTexts[i] = translator.translate
          ? await translator.translate(seg.text, "English")
          : seg.text;
      });
    }

    let done = 0;

    // Pass 2 — analyze the English text and persist textEn alongside analysis.
    await mapLimit(segments, 5, async (seg, i) => {
      const words = (seg.words as unknown as Word[]) ?? [];
      const englishText = englishTexts[i] ?? seg.text;
      const analysis = await provider.analyze({
        sentence: englishText,
        context: buildContext(englishTexts, i),
        words,
      });

      // Resolve anchor phrases to exact word-level timings for sync.
      const visualIdeas: VisualIdea[] = analysis.visualIdeas.map((idea) => {
        const t = resolveAnchor(idea.anchorPhrase, words, seg.startSec, seg.endSec);
        return { ...idea, anchorStart: t.start, anchorEnd: t.end };
      });

      await prisma.$transaction(async (tx) => {
        await tx.transcriptSegment.update({
          where: { id: seg.id },
          data: {
            textEn: englishText,
            topic: analysis.topic,
            intent: analysis.intent,
            context: analysis.context,
            emotions: analysis.emotions as unknown as Prisma.InputJsonValue,
            visualIdeas: visualIdeas as unknown as Prisma.InputJsonValue,
            analyzedAt: new Date(),
          },
        });

        if (analysis.topic) {
          await tx.topic.create({
            data: { projectId, segmentId: seg.id, name: analysis.topic, confidence: 0.9 },
          });
        }

        if (analysis.keywords.length > 0) {
          await tx.keyword.createMany({
            data: analysis.keywords.map((k) => {
              const timing = resolveKeywordTiming(k.text, words);
              return {
                projectId,
                segmentId: seg.id,
                text: k.text,
                kind: k.kind,
                confidence: k.confidence,
                startSec: timing.startSec ?? null,
                endSec: timing.endSec ?? null,
              };
            }),
          });
        }
      });

      done++;
      await setProgress(Math.round((done / segments.length) * 90));
    });

    await prisma.project.update({
      where: { id: projectId },
      data: { stage: ProcessingStage.ANALYZED },
    });

    await pipeline.generateAssets({ projectId });
    logger.info(`[analyze] done project=${projectId} segments=${segments.length}`);
  });
}

// --- helpers ---------------------------------------------------------------

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/gi, "");
}

function buildContext(texts: string[], i: number): string {
  return [texts[i - 1], texts[i + 1]].filter(Boolean).join(" ");
}

/** Find the time span of an anchor phrase within a segment's words. */
function resolveAnchor(
  phrase: string | undefined,
  words: Word[],
  segStart: number,
  segEnd: number,
): { start: number; end: number } {
  if (phrase && words.length > 0) {
    const target = phrase.split(/\s+/).map(norm).filter(Boolean);
    if (target.length > 0) {
      const w = words.map((x) => norm(x.word));
      for (let i = 0; i + target.length <= w.length; i++) {
        let match = true;
        for (let j = 0; j < target.length; j++) {
          if (w[i + j] !== target[j]) {
            match = false;
            break;
          }
        }
        if (match) return { start: words[i]!.start, end: words[i + target.length - 1]!.end };
      }
      const idx = w.findIndex((x) => target.includes(x));
      if (idx >= 0) return { start: words[idx]!.start, end: words[idx]!.end };
    }
  }
  return { start: segStart, end: segEnd };
}

function resolveKeywordTiming(
  text: string,
  words: Word[],
): { startSec?: number; endSec?: number } {
  const target = norm(text.split(/\s+/)[0] ?? "");
  if (!target) return {};
  const idx = words.findIndex((x) => {
    const n = norm(x.word);
    return n === target || n.includes(target);
  });
  if (idx >= 0) return { startSec: words[idx]!.start, endSec: words[idx]!.end };
  return {};
}
