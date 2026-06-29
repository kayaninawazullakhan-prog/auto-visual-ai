import { route, ok, badRequest } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireProject } from "@/lib/guards";
import { prisma } from "@ava/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/timeline?projectId=... — ordered timeline items for the editor. */
export const GET = route(async (req) => {
  const user = await requireUser();
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) throw badRequest("projectId is required");
  await requireProject(user.id, projectId);

  const items = await prisma.timelineItem.findMany({
    where: { projectId },
    orderBy: [{ track: "asc" }, { startSec: "asc" }],
    include: { asset: true },
  });

  return ok({ projectId, items });
});
