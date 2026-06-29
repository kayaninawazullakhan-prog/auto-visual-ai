import { route, ok, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { approveSchema } from "@/lib/validations";
import { requireProject } from "@/lib/guards";
import { prisma, ProjectStatus, ProcessingStage, AssetStatus } from "@ava/db";
import { pipeline } from "@ava/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Approval state machine. Accepts a batch of decisions:
 *  - APPROVED   → resolve the segment's pending approval to the chosen asset,
 *                 keep it READY, mark sibling options SKIPPED.
 *  - REJECTED   → mark the asset SKIPPED.
 *  - SKIPPED    → skip the whole segment (no visual for it).
 *  - EDIT_PROMPT/REGENERATE → re-queue generation for that segment.
 * When nothing is left pending, the timeline build is queued.
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  const { projectId, decisions } = await parseBody(req, approveSchema);
  await requireProject(user.id, projectId);

  const regenerate = new Set<string>();

  await prisma.$transaction(async (tx) => {
    for (const d of decisions) {
      // Resolve the target segment (from the decision or the asset).
      let segmentId = d.segmentId;
      if (!segmentId && d.assetId) {
        const a = await tx.generatedAsset.findUnique({
          where: { id: d.assetId },
          select: { segmentId: true },
        });
        segmentId = a?.segmentId ?? undefined;
      }

      // Resolve which approval row to update (explicit id → segment's row → new).
      let approvalId = d.approvalId;
      if (!approvalId && segmentId) {
        const existing = await tx.approval.findFirst({
          where: { projectId, segmentId },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });
        approvalId = existing?.id;
      }

      const approvalData = {
        decision: d.decision,
        note: d.note ?? null,
        editedPrompt: d.editedPrompt ?? null,
        assetId: d.assetId ?? null,
        segmentId: segmentId ?? null,
        decidedById: user.id,
        decidedAt: new Date(),
      };
      if (approvalId) {
        await tx.approval.update({ where: { id: approvalId }, data: approvalData });
      } else {
        await tx.approval.create({ data: { projectId, ...approvalData } });
      }

      // Asset-level effects.
      if (d.decision === "APPROVED" && d.assetId && segmentId) {
        await tx.generatedAsset.update({
          where: { id: d.assetId },
          data: { status: AssetStatus.READY },
        });
        // Exactly one visual per segment: skip the other options.
        await tx.generatedAsset.updateMany({
          where: { projectId, segmentId, id: { not: d.assetId } },
          data: { status: AssetStatus.SKIPPED },
        });
      } else if (d.decision === "REJECTED" && d.assetId) {
        await tx.generatedAsset.update({
          where: { id: d.assetId },
          data: { status: AssetStatus.SKIPPED },
        });
      } else if (d.decision === "EDIT_PROMPT" && d.assetId && d.editedPrompt) {
        await tx.generatedAsset.update({
          where: { id: d.assetId },
          data: { prompt: d.editedPrompt },
        });
      }

      if ((d.decision === "REGENERATE" || d.decision === "EDIT_PROMPT") && segmentId) {
        regenerate.add(segmentId);
      }
    }
  });

  // Regeneration takes priority — re-run those segments and stay in approval.
  if (regenerate.size > 0) {
    await prisma.project.update({
      where: { id: projectId },
      data: { status: ProjectStatus.GENERATING },
    });
    await pipeline.generateAssets({ projectId, segmentIds: [...regenerate] });
    return ok({ projectId, regenerate: [...regenerate] });
  }

  // All decisions resolved → build the timeline.
  const pending = await prisma.approval.count({
    where: { projectId, decision: "PENDING" },
  });
  if (pending === 0) {
    await prisma.project.update({
      where: { id: projectId },
      data: { stage: ProcessingStage.APPROVED },
    });
    await pipeline.buildTimeline({ projectId });
  }

  return ok({ projectId, pending });
});
