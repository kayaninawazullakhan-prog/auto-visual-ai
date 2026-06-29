import { route, ok, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { subtitlesSchema } from "@/lib/validations";
import { requireProject } from "@/lib/guards";
import { prisma } from "@ava/db";
import { pipeline } from "@ava/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Generate / regenerate captions. `mode` controls the language strategy
 * (English default / Original / Dual) and is persisted on the project so the
 * render uses the same choice. `style` picks the caption look.
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  const { projectId, mode, style, languages } = await parseBody(req, subtitlesSchema);
  await requireProject(user.id, projectId);

  if (mode) {
    await prisma.project.update({ where: { id: projectId }, data: { subtitleMode: mode } });
  }
  await pipeline.subtitles({ projectId, mode, style, languages });

  return ok({ projectId, queued: "subtitles", mode: mode ?? "project default", style: style ?? "KARAOKE" });
});
