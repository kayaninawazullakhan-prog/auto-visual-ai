import { route, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireProject } from "@/lib/guards";
import { getFeatures } from "@ava/config";
import { presignDownload } from "@ava/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Presigned media URLs for the editor: the source video, every generated asset
 * (image/video) with a thumbnail, and the latest rendered master. Returns null
 * URLs when storage isn't configured (the UI degrades gracefully).
 */
export const GET = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const project = await requireProject(user.id, id, {
    video: true,
    assets: { orderBy: [{ segmentId: "asc" }, { optionIndex: "asc" }] },
    renders: { where: { s3KeyOutput: { not: null } }, orderBy: { createdAt: "desc" }, take: 1 },
  });

  const storage = getFeatures().storage;
  const sign = (key: string | null | undefined) =>
    storage && key ? presignDownload(key, 6 * 3600) : Promise.resolve(null);

  const [sourceUrl, latestRenderUrl, assets] = await Promise.all([
    sign(project.video?.s3KeyOriginal),
    sign(project.renders[0]?.s3KeyOutput),
    Promise.all(
      project.assets.map(async (a) => ({
        id: a.id,
        segmentId: a.segmentId,
        kind: a.kind,
        provider: a.provider,
        style: a.style,
        optionIndex: a.optionIndex,
        prompt: a.prompt,
        status: a.status,
        confidence: a.confidence,
        durationSec: a.durationSec,
        width: a.width,
        height: a.height,
        url: await sign(a.s3Key),
        thumbnailUrl: await sign(a.thumbnailS3Key ?? a.s3Key),
      })),
    ),
  ]);

  return ok({ sourceUrl, latestRenderUrl, assets });
});
