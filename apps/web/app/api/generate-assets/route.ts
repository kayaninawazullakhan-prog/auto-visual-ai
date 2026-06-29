import { route, ok, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { generateAssetsSchema } from "@/lib/validations";
import { requireProject } from "@/lib/guards";
import { prisma, ProjectStatus, ProcessingStage } from "@ava/db";
import { pipeline } from "@ava/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Generate (or regenerate) image/video options for all or specific segments. */
export const POST = route(async (req) => {
  const user = await requireUser();
  const { projectId, segmentIds } = await parseBody(req, generateAssetsSchema);
  await requireProject(user.id, projectId);

  await prisma.project.update({
    where: { id: projectId },
    data: { status: ProjectStatus.GENERATING, stage: ProcessingStage.ANALYZED, error: null },
  });
  await pipeline.generateAssets({ projectId, segmentIds });

  return ok({ projectId, queued: "generate-assets", segmentIds: segmentIds ?? "all" });
});
