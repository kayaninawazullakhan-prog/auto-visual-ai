import { route, ok, badRequest, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import {
  createUploadSchema,
  fileExtension,
  ACCEPTED_VIDEO_EXT,
} from "@/lib/validations";
import { prisma, ProjectStatus, ProcessingStage, VideoStatus } from "@ava/db";
import { presignUpload, s3Keys } from "@ava/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Step 1 — create (or reuse) a project, register the source Video, and return a
 * presigned PUT URL so the browser uploads directly to S3. The original is never
 * overwritten (key includes the project id + original filename).
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  const body = await parseBody(req, createUploadSchema);

  const ext = fileExtension(body.filename);
  if (!ACCEPTED_VIDEO_EXT.includes(ext as (typeof ACCEPTED_VIDEO_EXT)[number])) {
    throw badRequest(
      `Unsupported file type ".${ext}". Allowed: ${ACCEPTED_VIDEO_EXT.join(", ")}`,
    );
  }

  // Reuse the caller's project if provided & owned, else create one.
  let projectId = body.projectId;
  if (projectId) {
    const existing = await prisma.project.findFirst({
      where: { id: projectId, userId: user.id },
      select: { id: true },
    });
    if (!existing) throw badRequest("Project not found");
  } else {
    const project = await prisma.project.create({
      data: {
        userId: user.id,
        title: body.title ?? body.filename,
        status: ProjectStatus.UPLOADING,
        stage: ProcessingStage.CREATED,
      },
    });
    projectId = project.id;
  }

  const key = s3Keys.original(projectId, sanitize(body.filename));

  // One source video per project — replace any prior placeholder row.
  const video = await prisma.video.upsert({
    where: { projectId },
    update: {
      originalFilename: body.filename,
      mimeType: body.mimeType,
      sizeBytes: BigInt(body.sizeBytes),
      s3KeyOriginal: key,
      status: VideoStatus.UPLOADING,
    },
    create: {
      projectId,
      originalFilename: body.filename,
      mimeType: body.mimeType,
      sizeBytes: BigInt(body.sizeBytes),
      s3KeyOriginal: key,
      status: VideoStatus.UPLOADING,
    },
  });

  const uploadUrl = await presignUpload(key, body.mimeType);

  return ok({ projectId, videoId: video.id, uploadUrl, s3Key: key }, { status: 201 });
});

/** Keep the original name but strip path separators / unsafe chars from the key. */
function sanitize(filename: string): string {
  return filename.replace(/[^\w.\-]+/g, "_");
}
