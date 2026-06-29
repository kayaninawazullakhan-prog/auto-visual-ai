import { route, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireProject } from "@/lib/guards";
import { prisma } from "@ava/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const project = await requireProject(user.id, id, {
    video: true,
    branding: true,
    transcript: { include: { segments: { orderBy: { index: "asc" } } } },
    topics: true,
    keywords: true,
    assets: { orderBy: [{ segmentId: "asc" }, { optionIndex: "asc" }] },
    approvals: true,
    timelineItems: { orderBy: [{ track: "asc" }, { startSec: "asc" }] },
    subtitles: true,
    renders: { orderBy: { createdAt: "desc" }, include: { exports: true } },
    exports: true,
    jobs: { orderBy: { createdAt: "desc" }, take: 50 },
  });
  return ok({ project });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  await requireProject(user.id, id);
  await prisma.project.delete({ where: { id } });
  return ok({ deleted: true });
});
