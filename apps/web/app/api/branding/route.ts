import { route, ok, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { brandingSchema } from "@/lib/validations";
import { requireProject } from "@/lib/guards";
import { prisma, Prisma } from "@ava/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Upsert branding (logo/watermark/handle/colors/font/placement) for a project. */
export const POST = route(async (req) => {
  const user = await requireUser();
  const { projectId, brandColors, placement, ...rest } = await parseBody(req, brandingSchema);
  await requireProject(user.id, projectId);

  const data = {
    ...rest,
    brandColors: brandColors ? (brandColors as Prisma.InputJsonValue) : undefined,
    placement: placement ? (placement as Prisma.InputJsonValue) : undefined,
  };

  const branding = await prisma.branding.upsert({
    where: { projectId },
    update: data,
    create: { projectId, ...data },
  });

  return ok({ branding });
});
