import { route, ok, badRequest } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireProject } from "@/lib/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/project?id=... — spec-aligned alias for the full project view.
 * (REST equivalent: GET /api/projects/[id].)
 */
export const GET = route(async (req) => {
  const user = await requireUser();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) throw badRequest("id is required");

  const project = await requireProject(user.id, id, {
    video: true,
    branding: true,
    transcript: { include: { segments: { orderBy: { index: "asc" } } } },
    topics: true,
    keywords: true,
    assets: true,
    approvals: true,
    timelineItems: { orderBy: [{ track: "asc" }, { startSec: "asc" }] },
    subtitles: true,
    renders: { orderBy: { createdAt: "desc" }, include: { exports: true } },
    exports: true,
    jobs: { orderBy: { createdAt: "desc" }, take: 50 },
  });

  return ok({ project });
});
