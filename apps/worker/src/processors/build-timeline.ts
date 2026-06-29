import type { Job } from "@ava/queue";
import type { BuildTimelineJob } from "@ava/types";
import { prisma, Prisma, ProjectStatus, ProcessingStage } from "@ava/db";
import { pipeline } from "@ava/queue";
import { withJob } from "../lib/run-job.js";
import { buildTimeline as buildTimelineItems } from "../lib/timeline.js";
import { logger } from "../lib/logger.js";

/**
 * Step 13 — assemble the timeline from approved assets + word-derived segment
 * timings, persist TimelineItem rows, mark the project READY_TO_RENDER, then
 * chain to subtitle generation.
 */
export async function buildTimeline(job: Job<BuildTimelineJob>) {
  const { projectId } = job.data;
  return withJob(projectId, "BUILD_TIMELINE", async () => {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { video: true },
    });
    const durationSec = project?.video?.durationSec ?? 0;
    if (!durationSec) throw new Error("Video duration unknown; cannot build timeline");

    // Approved visuals: one chosen asset per segment.
    const approvals = await prisma.approval.findMany({
      where: { projectId, decision: "APPROVED", assetId: { not: null } },
      include: { asset: true, segment: true },
    });

    const visuals = approvals
      .filter((a) => a.asset && a.segment && a.asset.status !== "FAILED")
      .map((a) => ({
        assetId: a.assetId!,
        segmentId: a.segmentId!,
        startSec: a.segment!.startSec,
        endSec: a.segment!.endSec,
        kind: a.asset!.kind as "IMAGE" | "VIDEO" | "ANIMATION" | "MOTION_GRAPHIC",
      }));

    const items = buildTimelineItems({ durationSec, visuals });

    await prisma.$transaction([
      prisma.timelineItem.deleteMany({ where: { projectId } }),
      prisma.timelineItem.createMany({
        data: items.map((it) => ({
          projectId,
          track: it.track,
          type: it.type,
          startSec: it.startSec,
          endSec: it.endSec,
          order: it.order,
          assetId: it.assetId ?? null,
          segmentId: it.segmentId ?? null,
          transition: it.transition
            ? (it.transition as unknown as Prisma.InputJsonValue)
            : undefined,
          meta: it.meta ? (it.meta as Prisma.InputJsonValue) : undefined,
        })),
      }),
    ]);

    await prisma.project.update({
      where: { id: projectId },
      data: { stage: ProcessingStage.TIMELINE_BUILT, status: ProjectStatus.READY_TO_RENDER },
    });

    // Captions can be generated now that timing is locked in.
    await pipeline.subtitles({ projectId });
    logger.info(
      `[build-timeline] done project=${projectId} items=${items.length} visuals=${visuals.length}`,
    );
  });
}
