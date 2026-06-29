import { route, ok, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { projectIdSchema } from "@/lib/validations";
import { requireProject } from "@/lib/guards";
import { prisma, ProjectStatus } from "@ava/db";
import { pipeline } from "@ava/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Re-run AI understanding (topics / keywords / entities / visual ideas). */
export const POST = route(async (req) => {
  const user = await requireUser();
  const { projectId } = await parseBody(req, projectIdSchema);
  await requireProject(user.id, projectId);

  await prisma.project.update({
    where: { id: projectId },
    data: { status: ProjectStatus.PROCESSING, error: null },
  });
  await pipeline.analyze({ projectId });

  return ok({ projectId, queued: "analyze" });
});
