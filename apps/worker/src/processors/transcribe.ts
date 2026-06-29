import path from "node:path";
import type { Job } from "@ava/queue";
import type { TranscribeJob } from "@ava/types";
import { prisma, Prisma, Language, TranscriptStatus, ProcessingStage } from "@ava/db";
import { downloadToFile, assetInputUrl } from "@ava/storage";
import { getTranscriptionProvider } from "@ava/ai";
import { pipeline } from "@ava/queue";
import { withJob } from "../lib/run-job.js";
import { withTempDir } from "../lib/files.js";
import { logger } from "../lib/logger.js";

/**
 * Steps 3–4 — transcribe the extracted audio with word-level timestamps, persist
 * Transcript + TranscriptSegment rows, then chain to analysis.
 */
export async function transcribe(job: Job<TranscribeJob>) {
  const { projectId } = job.data;
  return withJob(projectId, "TRANSCRIBE", async (setProgress) => {
    const video = await prisma.video.findUnique({ where: { projectId } });
    if (!video?.s3KeyAudio) throw new Error("Audio has not been extracted yet");

    const provider = getTranscriptionProvider();

    const result = await withTempDir(async (dir) => {
      const audioPath = path.join(dir, "audio.wav");
      await downloadToFile(video.s3KeyAudio!, audioPath);
      // Reachable input for URL-based providers (presigned for S3, data-URI for local).
      const audioUrl = await assetInputUrl(video.s3KeyAudio!).catch(() => undefined);
      await setProgress(30);
      return provider.transcribe({ audioPath, audioUrl, wordTimestamps: true });
    });
    await setProgress(70);

    const language = toLanguageEnum(result.language);

    await prisma.$transaction(async (tx) => {
      const existing = await tx.transcript.findUnique({ where: { projectId } });
      if (existing) {
        await tx.transcriptSegment.deleteMany({ where: { transcriptId: existing.id } });
      }
      const transcript = await tx.transcript.upsert({
        where: { projectId },
        update: {
          language,
          detectedLanguage: result.language,
          provider: provider.name,
          fullText: result.text,
          status: TranscriptStatus.COMPLETED,
        },
        create: {
          projectId,
          language,
          detectedLanguage: result.language,
          provider: provider.name,
          fullText: result.text,
          status: TranscriptStatus.COMPLETED,
        },
      });

      if (result.segments.length > 0) {
        await tx.transcriptSegment.createMany({
          data: result.segments.map((s) => ({
            transcriptId: transcript.id,
            index: s.index,
            text: s.text,
            startSec: s.start,
            endSec: s.end,
            words: s.words as unknown as Prisma.InputJsonValue,
          })),
        });
      }
    });

    await prisma.project.update({
      where: { id: projectId },
      data: { stage: ProcessingStage.TRANSCRIBED },
    });

    await pipeline.analyze({ projectId });
    logger.info(`[transcribe] done project=${projectId} segments=${result.segments.length}`);
  });
}

const LANGUAGE_MAP: Record<string, Language> = {
  en: Language.EN,
  hi: Language.HI,
  ur: Language.UR,
  ar: Language.AR,
  es: Language.ES,
  fr: Language.FR,
  de: Language.DE,
  pt: Language.PT,
};

function toLanguageEnum(code: string): Language {
  return LANGUAGE_MAP[code.slice(0, 2).toLowerCase()] ?? Language.EN;
}
