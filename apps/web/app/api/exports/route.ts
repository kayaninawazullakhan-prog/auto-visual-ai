import { route, ok, badRequest } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireProject } from "@/lib/guards";
import { prisma } from "@ava/db";
import { getFeatures } from "@ava/config";
import { presignDownload } from "@ava/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/exports?projectId=... — exports with fresh signed download URLs. */
export const GET = route(async (req) => {
  const user = await requireUser();
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) throw badRequest("projectId is required");
  await requireProject(user.id, projectId);

  const exports = await prisma.export.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });

  const storageReady = getFeatures().storage;
  const withUrls = await Promise.all(
    exports.map(async (e) => ({
      ...e,
      sizeBytes: e.sizeBytes ? e.sizeBytes.toString() : null,
      downloadUrl:
        storageReady && e.s3Key ? await presignDownload(e.s3Key, 3600) : null,
    })),
  );

  return ok({ projectId, exports: withUrls });
});
