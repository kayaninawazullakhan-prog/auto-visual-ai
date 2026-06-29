import path from "node:path";
import type { Job } from "@ava/queue";
import type { QualityCheckJob } from "@ava/types";
import { prisma, Prisma, RenderStatus } from "@ava/db";
import { loadEnv } from "@ava/config";
import { pipeline } from "@ava/queue";
import { downloadToFile } from "@ava/storage";
import { probe, assessQuality } from "@ava/media";
import { withJob } from "../lib/run-job.js";
import { withTempDir } from "../lib/files.js";
import { logger } from "../lib/logger.js";

/**
 * Quality validation gate (≥ QUALITY_MIN_SCORE). Downloads the rendered master,
 * probes it, scores it on resolution / frame rate / bitrate / artifacts /
 * audio, and records the report on the Render. Below-threshold renders are
 * flagged with a recommended action and logged — we do NOT auto-rerender here
 * (that would risk an unbounded loop); the pipeline proceeds to export.
 */
export async function qualityCheck(job: Job<QualityCheckJob>) {
  const { projectId, renderId } = job.data;
  return withJob(projectId, "QUALITY_CHECK", async (setProgress) => {
    const env = loadEnv();

    const renderRow = await prisma.render.findUnique({ where: { id: renderId } });
    if (!renderRow?.s3KeyOutput) {
      throw new Error(`Render ${renderId} has no output to validate`);
    }

    await prisma.render.update({
      where: { id: renderId },
      data: { status: RenderStatus.VALIDATING },
    });
    await setProgress(10);

    const report = await withTempDir(async (dir) => {
      const localPath = path.join(dir, "master.mp4");
      await downloadToFile(renderRow.s3KeyOutput!, localPath);
      await setProgress(50);
      const meta = await probe(localPath);
      return assessQuality(meta, {
        minScore: env.QUALITY_MIN_SCORE,
        targetWidth: renderRow.width ?? 1080,
        targetHeight: renderRow.height ?? 1920,
        targetFps: renderRow.fps ?? 30,
      });
    });
    await setProgress(80);

    await prisma.render.update({
      where: { id: renderId },
      data: {
        status: RenderStatus.DONE,
        progress: 100,
        qualityScore: report.overall,
        qualityReport: report as unknown as Prisma.InputJsonValue,
        finishedAt: new Date(),
      },
    });

    if (!report.passed) {
      logger.warn(
        `[quality-check] project=${projectId} render=${renderId} BELOW threshold: score=${report.overall} < ${env.QUALITY_MIN_SCORE} action=${report.action} — proceeding to export anyway`,
      );
    } else {
      logger.info(
        `[quality-check] project=${projectId} render=${renderId} passed score=${report.overall}`,
      );
    }

    // Determine what to export from the pending Export rows created at request
    // time. They share format/codec (set together by the render API).
    const exportRows = await prisma.export.findMany({
      where: { renderId, s3Key: null },
      orderBy: { createdAt: "asc" },
    });

    if (exportRows.length === 0) {
      logger.info(`[quality-check] project=${projectId} render=${renderId} — no exports requested`);
      await setProgress(100);
      return;
    }

    const presets = exportRows.map((e) => e.preset as string);
    const first = exportRows[0]!;
    await pipeline.export({
      projectId,
      renderId,
      presets,
      format: first.format,
      codec: first.codec,
    });
    await setProgress(100);

    logger.info(
      `[quality-check] project=${projectId} render=${renderId} → export queued presets=${presets.join(",")}`,
    );
  });
}
