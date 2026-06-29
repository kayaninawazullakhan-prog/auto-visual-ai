import { prisma, syncEnvFromDb, type JobType } from "@ava/db";
import { logger } from "./logger.js";

export type ProgressFn = (percent: number) => Promise<void>;

/**
 * Wraps a pipeline stage with Job-row lifecycle management: creates a Job row,
 * tracks progress, marks COMPLETED/FAILED, and flips the Project to FAILED on
 * error. Stages stay focused on their actual work.
 */
export async function withJob<T>(
  projectId: string,
  type: JobType,
  fn: (setProgress: ProgressFn) => Promise<T>,
): Promise<T> {
  // Pick up the latest UI-saved API keys before each job (no restart needed).
  await syncEnvFromDb().catch(() => undefined);

  const job = await prisma.job.create({
    data: { projectId, type, status: "ACTIVE", startedAt: new Date() },
  });

  const setProgress: ProgressFn = async (percent) => {
    await prisma.job.update({
      where: { id: job.id },
      data: { progress: Math.max(0, Math.min(100, percent)) },
    });
  };

  try {
    const result = await fn(setProgress);
    await prisma.job.update({
      where: { id: job.id },
      data: { status: "COMPLETED", progress: 100, finishedAt: new Date() },
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.job.update({
      where: { id: job.id },
      data: { status: "FAILED", error: message, finishedAt: new Date() },
    });
    await prisma.project
      .update({ where: { id: projectId }, data: { status: "FAILED", error: message } })
      .catch(() => undefined);
    logger.error(`[${type}] failed for project=${projectId}: ${message}`);
    throw err;
  }
}
