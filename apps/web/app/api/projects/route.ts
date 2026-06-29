import { route, ok, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { createProjectSchema } from "@/lib/validations";
import { prisma } from "@ava/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const user = await requireUser();
  const projects = await prisma.project.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      video: true,
      _count: { select: { assets: true, renders: true, exports: true } },
    },
  });
  return ok({ projects });
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const body = await parseBody(req, createProjectSchema);
  const project = await prisma.project.create({
    data: {
      userId: user.id,
      title: body.title ?? "Untitled project",
      description: body.description,
    },
  });
  return ok({ project }, { status: 201 });
});
