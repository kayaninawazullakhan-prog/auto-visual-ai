import { route, ok, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { renderSchema } from "@/lib/validations";
import { requireProject } from "@/lib/guards";
import { prisma, ProjectStatus, ProcessingStage } from "@ava/db";
import { pipeline } from "@ava/queue";
import { EXPORT_PRESET_DIMENSIONS } from "@ava/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Kick off a render. Creates the Render row plus a pending Export row per
 * requested preset (so the worker knows what to produce), then queues the job.
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  const { projectId, presets, format, codec } = await parseBody(req, renderSchema);
  await requireProject(user.id, projectId);

  const render = await prisma.render.create({ data: { projectId } });

  await prisma.export.createMany({
    data: presets.map((preset) => {
      const dims = EXPORT_PRESET_DIMENSIONS[preset]!;
      return {
        projectId,
        renderId: render.id,
        preset,
        format,
        codec,
        width: dims.width,
        height: dims.height,
      };
    }),
  });

  await prisma.project.update({
    where: { id: projectId },
    data: { status: ProjectStatus.RENDERING, stage: ProcessingStage.APPROVED, error: null },
  });

  await pipeline.render({ projectId, renderId: render.id });

  return ok({ render, presets, format, codec }, { status: 201 });
});
