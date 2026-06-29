import path from "node:path";
import { readFile } from "node:fs/promises";
import type { Job } from "@ava/queue";
import type { RenderJob } from "@ava/types";
import { prisma, ProjectStatus, RenderStatus } from "@ava/db";
import { loadEnv } from "@ava/config";
import { pipeline } from "@ava/queue";
import { s3Keys, putObject } from "@ava/storage";
import { renderComposition } from "@ava/render";
import { probe } from "@ava/media";
import { withJob } from "../lib/run-job.js";
import { withTempDir } from "../lib/files.js";
import { buildRenderProps } from "../lib/render-data.js";
import { logger } from "../lib/logger.js";

/**
 * Step 15 — Remotion render of the 9:16 composition. Builds the input props
 * from the approved timeline + captions + branding, renders to a temp MP4,
 * probes it, uploads the master to S3, then chains the quality-check stage.
 */
export async function render(job: Job<RenderJob>) {
  const { projectId, renderId } = job.data;
  return withJob(projectId, "RENDER", async (setProgress) => {
    const env = loadEnv();

    await prisma.render.update({
      where: { id: renderId },
      data: { status: RenderStatus.RENDERING, progress: 0, startedAt: new Date(), error: null },
    });
    await setProgress(5);

    const props = await buildRenderProps(projectId);
    await setProgress(15);

    const outputKey = s3Keys.render(projectId, renderId, "mp4");

    await withTempDir(async (dir) => {
      const outPath = path.join(dir, `${renderId}.mp4`);

      logger.info(
        `[render] project=${projectId} render=${renderId} frames=${props.durationInFrames} visuals=${props.visuals.length} captions=${props.captions.length}`,
      );
      await renderComposition(props, outPath, { concurrency: env.REMOTION_CONCURRENCY });
      await setProgress(80);

      // Compositing/upload phase: probe the master and persist it.
      await prisma.render.update({
        where: { id: renderId },
        data: { status: RenderStatus.COMPOSITING, progress: 80 },
      });

      const meta = await probe(outPath);
      await putObject(outputKey, await readFile(outPath), "video/mp4");
      await setProgress(95);

      await prisma.render.update({
        where: { id: renderId },
        data: {
          s3KeyOutput: outputKey,
          width: meta.width || props.width,
          height: meta.height || props.height,
          fps: meta.fps || props.fps,
          durationSec: meta.durationSec,
          codec: meta.videoCodec || "h264",
          bitrate: meta.bitrate ?? null,
        },
      });
    });

    // Keep the project in RENDERING; quality-check flips it to COMPLETED.
    await prisma.project.update({
      where: { id: projectId },
      data: { status: ProjectStatus.RENDERING, error: null },
    });

    await pipeline.qualityCheck({ projectId, renderId });
    await setProgress(100);

    logger.info(`[render] done project=${projectId} render=${renderId} → quality-check queued`);
  });
}
