import { route, ok, parseBody, notFound } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { completeUploadSchema } from "@/lib/validations";
import { prisma, ProjectStatus, ProcessingStage, VideoStatus } from "@ava/db";
import { pipeline } from "@ava/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Step 2 — the browser finished uploading to S3. Mark the video uploaded and
 * kick off the pipeline (extract-audio → transcribe → analyze → generate).
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  const { videoId } = await parseBody(req, completeUploadSchema);

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: { project: { select: { id: true, userId: true } } },
  });
  if (!video || video.project.userId !== user.id) throw notFound("Video not found");

  await prisma.$transaction([
    prisma.video.update({
      where: { id: videoId },
      data: { status: VideoStatus.UPLOADED },
    }),
    prisma.project.update({
      where: { id: video.projectId },
      data: { status: ProjectStatus.PROCESSING, stage: ProcessingStage.UPLOADED, error: null },
    }),
  ]);

  await pipeline.extractAudio({ projectId: video.projectId });

  return ok({ projectId: video.projectId, status: "processing" });
});
