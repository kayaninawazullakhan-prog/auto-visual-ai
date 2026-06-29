import type { Job } from "@ava/queue";
import type { SubtitlesJob, Word, CaptionStyleName } from "@ava/types";
import { prisma, Prisma, Language, ProcessingStage } from "@ava/db";
import { getTranslationProvider } from "@ava/ai";
import { withJob } from "../lib/run-job.js";
import { logger } from "../lib/logger.js";
import {
  CAPTION_PRESETS,
  groupWords,
  synthCaptionWords,
  languageName,
} from "../lib/subtitles.js";

/**
 * Step 12 — generate animated captions. Default behavior keeps the original
 * spoken audio and renders English subtitles (translated during analysis into
 * `segment.textEn`). Mode can be ENGLISH (default), ORIGINAL, or DUAL; extra
 * translated tracks can be requested via `languages`. Active-word highlighting
 * is computed at render time from the per-word timings stored here.
 */
export async function subtitles(job: Job<SubtitlesJob>) {
  const { projectId, mode: jobMode, style: jobStyle, languages } = job.data;
  return withJob(projectId, "SUBTITLES", async (setProgress) => {
    const [transcript, project] = await Promise.all([
      prisma.transcript.findUnique({
        where: { projectId },
        include: { segments: { orderBy: { index: "asc" } } },
      }),
      prisma.project.findUnique({ where: { id: projectId }, select: { subtitleMode: true } }),
    ]);
    if (!transcript) throw new Error("No transcript available for captions");

    const mode = jobMode ?? project?.subtitleMode ?? "ENGLISH";
    const styleName: CaptionStyleName = jobStyle ?? "KARAOKE";
    const preset = CAPTION_PRESETS[styleName];
    const origLang = transcript.language;
    const isEnglishAudio = origLang === Language.EN;

    await prisma.subtitle.deleteMany({ where: { projectId } });

    const rows: Prisma.SubtitleCreateManyInput[] = [];
    const base = (segmentId: string, text: string, startSec: number, endSec: number, words: unknown) => ({
      projectId,
      segmentId,
      style: preset.style,
      animation: preset.animation,
      text,
      startSec,
      endSec,
      words: words as Prisma.InputJsonValue,
      meta: preset.meta as unknown as Prisma.InputJsonValue,
    });

    for (const seg of transcript.segments) {
      const realWords = (seg.words as unknown as Word[]) ?? [];
      const englishText = seg.textEn ?? seg.text;

      if (isEnglishAudio) {
        // English audio: real word timings, one EN track.
        for (const g of groupWords(realWords, preset.maxWords)) {
          rows.push({ ...base(seg.id, g.text, g.startSec, g.endSec, g.words), language: Language.EN });
        }
        continue;
      }

      // English captions (default / dual): synthesize word timings over the span.
      if (mode === "ENGLISH" || mode === "DUAL") {
        const enWords = synthCaptionWords(englishText, seg.startSec, seg.endSec) as unknown as Word[];
        for (const g of groupWords(enWords, preset.maxWords)) {
          rows.push({ ...base(seg.id, g.text, g.startSec, g.endSec, g.words), language: Language.EN });
        }
      }
      // Original-language captions (original / dual): real word timings.
      if (mode === "ORIGINAL" || mode === "DUAL") {
        for (const g of groupWords(realWords, preset.maxWords)) {
          rows.push({ ...base(seg.id, g.text, g.startSec, g.endSec, g.words), language: origLang });
        }
      }
    }

    await prisma.subtitle.createMany({ data: rows });
    await setProgress(50);

    // Extra translated tracks (optional), translated from English for quality.
    const produced = new Set<string>([Language.EN, origLang]);
    const targets = (languages ?? []).filter((l) => !produced.has(l)) as Language[];
    if (targets.length > 0) {
      const translator = getTranslationProvider();
      let done = 0;
      for (const lang of targets) {
        const extra: Prisma.SubtitleCreateManyInput[] = [];
        for (const seg of transcript.segments) {
          const source = seg.textEn ?? seg.text;
          const text = translator.translate
            ? await translator.translate(source, languageName(lang))
            : source;
          extra.push({
            ...base(
              seg.id,
              text,
              seg.startSec,
              seg.endSec,
              synthCaptionWords(text, seg.startSec, seg.endSec),
            ),
            language: lang,
          });
        }
        await prisma.subtitle.createMany({ data: extra });
        done++;
        await setProgress(50 + Math.round((done / targets.length) * 45));
      }
    }

    await prisma.project.update({
      where: { id: projectId },
      data: { stage: ProcessingStage.SUBTITLES_GENERATED },
    });
    logger.info(
      `[subtitles] done project=${projectId} mode=${mode} style=${styleName} rows=${rows.length} extraLangs=${targets.join(",") || "none"}`,
    );
  });
}
