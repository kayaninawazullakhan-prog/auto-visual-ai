import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import type { Job } from "@ava/queue";
import type { ExportJob } from "@ava/types";
import { prisma, ProjectStatus, ProcessingStage, ExportFormat } from "@ava/db";
import { EXPORT_PRESET_DIMENSIONS } from "@ava/types";
import { s3Keys, putObject, downloadToFile } from "@ava/storage";
import { transcode, probe, type TranscodeCodec } from "@ava/media";
import { withJob } from "../lib/run-job.js";
import { withTempDir } from "../lib/files.js";
import { logger } from "../lib/logger.js";

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

const FORMAT_EXT: Record<ExportFormat, string> = {
  MP4: "mp4",
  MOV: "mov",
};

const FORMAT_CONTENT_TYPE: Record<ExportFormat, string> = {
  MP4: "video/mp4",
  MOV: "video/quicktime",
};

/**
 * Step 16 — transcode the rendered master into each requested export preset
 * (resolution + codec + container). The master is downloaded once and reused
 * for every variant. Each Export row is updated with its S3 key, size and
 * bitrate; once all complete the project is marked COMPLETED / EXPORTED.
 */
export async function exportRender(job: Job<ExportJob>) {
  const { projectId, renderId } = job.data;
  return withJob(projectId, "EXPORT", async (setProgress) => {
    const renderRow = await prisma.render.findUnique({ where: { id: renderId } });
    if (!renderRow?.s3KeyOutput) {
      throw new Error(`Render ${renderId} has no master output to export`);
    }

    // The pending Export rows are the source of truth for what to produce.
    const exportRows = await prisma.export.findMany({
      where: { renderId },
      orderBy: { createdAt: "asc" },
    });
    if (exportRows.length === 0) throw new Error(`No export rows for render ${renderId}`);

    await withTempDir(async (dir) => {
      const masterPath = path.join(dir, "master.mp4");
      await downloadToFile(renderRow.s3KeyOutput!, masterPath);
      await setProgress(10);

      let done = 0;
      for (const exp of exportRows) {
        const dims = EXPORT_PRESET_DIMENSIONS[exp.preset] ?? {
          width: exp.width,
          height: exp.height,
        };
        const ext = FORMAT_EXT[exp.format];
        const outPath = path.join(dir, `${exp.id}.${ext}`);

        logger.info(
          `[export] project=${projectId} render=${renderId} export=${exp.id} preset=${exp.preset} ${dims.width}x${dims.height} ${exp.codec}/${exp.format}`,
        );

        await transcode(masterPath, outPath, {
          width: dims.width,
          height: dims.height,
          fps: exp.fps,
          codec: exp.codec as TranscodeCodec,
          ...(exp.bitrate ? { bitrate: exp.bitrate } : {}),
        });

        const key = s3Keys.export(projectId, exp.id, ext);
        await putObject(key, await readFile(outPath), FORMAT_CONTENT_TYPE[exp.format]);

        const sizeBytes = (await stat(outPath)).size;
        let bitrate = exp.bitrate ?? null;
        try {
          const meta = await probe(outPath);
          if (meta.bitrate) bitrate = meta.bitrate;
        } catch (e) {
          logger.warn(`[export] probe failed export=${exp.id}: ${msg(e)}`);
        }

        await prisma.export.update({
          where: { id: exp.id },
          data: {
            s3Key: key,
            width: dims.width,
            height: dims.height,
            sizeBytes: BigInt(sizeBytes),
            bitrate,
          },
        });

        done++;
        await setProgress(10 + Math.round((done / exportRows.length) * 85));
      }
    });

    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.COMPLETED,
        stage: ProcessingStage.EXPORTED,
        error: null,
      },
    });
    await setProgress(100);

    logger.info(
      `[export] done project=${projectId} render=${renderId} exports=${exportRows.length} → COMPLETED`,
    );
  });
}
