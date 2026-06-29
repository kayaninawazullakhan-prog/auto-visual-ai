import { prisma, type Prisma } from "@ava/db";
import { notFound } from "./api";

/**
 * Fetch a project that belongs to `userId`, or throw 404 (we don't leak the
 * existence of other users' projects). The `include` generic flows through to
 * the return type so callers get fully-typed relations.
 */
export async function requireProject<
  I extends Prisma.ProjectInclude | undefined = undefined,
>(
  userId: string,
  projectId: string,
  include?: I,
): Promise<Prisma.ProjectGetPayload<{ include: I }>> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    include: include as I,
  });
  if (!project) throw notFound("Project not found");
  return project as Prisma.ProjectGetPayload<{ include: I }>;
}
