import { route, ok, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { brandingUploadSchema, fileExtension } from "@/lib/validations";
import { requireProject } from "@/lib/guards";
import { presignUpload, s3Keys } from "@ava/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Presigned upload for a branding asset (logo / watermark / font). The client
 * uploads to S3, then POSTs the returned key to /api/branding.
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  const { projectId, kind, filename, mimeType } = await parseBody(req, brandingUploadSchema);
  await requireProject(user.id, projectId);

  const ext = fileExtension(filename) || "bin";
  const key = s3Keys.branding(projectId, `${kind}.${ext}`);
  const uploadUrl = await presignUpload(key, mimeType);

  return ok({ kind, key, uploadUrl });
});
