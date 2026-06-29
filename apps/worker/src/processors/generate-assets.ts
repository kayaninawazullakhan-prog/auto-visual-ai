import path from "node:path";
import { readFile } from "node:fs/promises";
import type { Job } from "@ava/queue";
import type { GenerateAssetsJob, VisualIdea } from "@ava/types";
import {
  prisma,
  Prisma,
  ProjectStatus,
  ProcessingStage,
  AssetKind,
  AssetStatus,
} from "@ava/db";
import { getFeatures, loadEnv, MissingProviderKeyError } from "@ava/config";
import {
  getImageProvider,
  imageProviderEnum,
  getVideoProvider,
  videoProviderEnum,
  videoNeedsSeedImage,
  buildImagePromptOptions,
  buildVideoPromptOptions,
  DEFAULT_IMAGE_STYLES,
  DEFAULT_VIDEO_STYLES,
  NEGATIVE_PROMPT,
} from "@ava/ai";
import { s3Keys, putObject, uploadFromUrl, downloadUrlToFile, assetInputUrl } from "@ava/storage";
import { extractFrame } from "@ava/media";
import { withJob } from "../lib/run-job.js";
import { withTempDir } from "../lib/files.js";
import { mapLimit } from "../lib/concurrency.js";
import { logger } from "../lib/logger.js";

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Steps 9–11 — generate image/video options per segment from its top visual
 * idea (one prompt per style via the Prompt Engine), upload to S3, then set the
 * project to AWAITING_APPROVAL. The pipeline intentionally pauses here: rendering
 * is only queued after the user approves (Phase 5).
 */
export async function generateAssets(job: Job<GenerateAssetsJob>) {
  const { projectId, segmentIds } = job.data;
  return withJob(projectId, "GENERATE_ASSETS", async (setProgress) => {
    const features = getFeatures();
    if (!features.storage) {
      throw new MissingProviderKeyError("aws-s3", [
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
        "S3_BUCKET",
      ]);
    }
    if (!features.imageGeneration && !features.videoGeneration) {
      throw new MissingProviderKeyError("image/video generation", [
        "FAL_KEY / REPLICATE_API_TOKEN / OPENAI_API_KEY (images)",
        "RUNWAY_API_KEY / KLING_* / PIKA_API_KEY (video)",
      ]);
    }

    const env = loadEnv();
    const imageProvider = features.imageGeneration ? getImageProvider() : null;
    const videoProvider = features.videoGeneration ? getVideoProvider() : null;
    const imgEnum = features.imageGeneration ? imageProviderEnum() : null;
    const vidEnum = features.videoGeneration ? videoProviderEnum() : null;
    const needSeed = features.videoGeneration ? videoNeedsSeedImage() : false;

    const segments = await prisma.transcriptSegment.findMany({
      where: {
        transcript: { projectId },
        ...(segmentIds?.length ? { id: { in: segmentIds } } : {}),
      },
      orderBy: { index: "asc" },
    });
    if (segments.length === 0) throw new Error("No analyzed segments to generate for");

    // Clear prior assets + approvals for the scope (full run or specific segments).
    const scopeWhere = segmentIds?.length
      ? { projectId, segmentId: { in: segmentIds } }
      : { projectId };
    await prisma.$transaction([
      prisma.generatedAsset.deleteMany({ where: scopeWhere }),
      prisma.approval.deleteMany({ where: scopeWhere }),
    ]);

    const imageStyles = DEFAULT_IMAGE_STYLES.slice(0, env.IMAGE_OPTIONS_PER_SEGMENT);
    const videoStyles = DEFAULT_VIDEO_STYLES.slice(0, env.VIDEO_OPTIONS_PER_SEGMENT);

    const segmentsWithAssets = new Set<string>();
    let processed = 0;

    await mapLimit(segments, 2, async (seg) => {
      const ideas = ((seg.visualIdeas as unknown as VisualIdea[]) ?? [])
        .slice()
        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

      if (ideas.length > 0) {
        const idea = ideas[0]!;
        const ctx = { topic: seg.topic ?? undefined };
        let seedKey: string | undefined;

        // --- IMAGES ---
        if (imageProvider && imgEnum) {
          const opts = buildImagePromptOptions(idea, imageStyles, ctx);
          await mapLimit(opts, 2, async (opt, idx) => {
            const asset = await prisma.generatedAsset.create({
              data: {
                projectId,
                segmentId: seg.id,
                kind: AssetKind.IMAGE,
                provider: imgEnum,
                style: opt.style,
                optionIndex: idx,
                prompt: opt.prompt,
                status: AssetStatus.GENERATING,
                confidence: idea.priority ?? 0.7,
              },
            });
            try {
              const img = await imageProvider.generate(opt.prompt, {
                aspectRatio: "9:16",
                quality: "high",
                style: opt.style,
                negativePrompt: NEGATIVE_PROMPT,
              });
              const key = s3Keys.asset(projectId, asset.id, "png");
              await uploadFromUrl(img.url, key, "image/png");
              await prisma.generatedAsset.update({
                where: { id: asset.id },
                data: {
                  status: AssetStatus.READY,
                  s3Key: key,
                  thumbnailS3Key: key,
                  width: img.width || 1080,
                  height: img.height || 1920,
                  meta: (img.meta ?? {}) as Prisma.InputJsonValue,
                },
              });
              if (idx === 0) seedKey = key;
              segmentsWithAssets.add(seg.id);
            } catch (e) {
              await prisma.generatedAsset.update({
                where: { id: asset.id },
                data: { status: AssetStatus.FAILED, error: msg(e) },
              });
              logger.warn(`[generate-assets] image failed seg=${seg.id} opt=${idx}: ${msg(e)}`);
            }
          });
        }

        // --- VIDEOS ---
        if (videoProvider && vidEnum && videoStyles.length > 0) {
          let seedUrl: string | undefined;
          if (needSeed) {
            const key =
              seedKey ??
              (
                await prisma.generatedAsset.findFirst({
                  where: { projectId, segmentId: seg.id, kind: AssetKind.IMAGE, status: AssetStatus.READY },
                  orderBy: { optionIndex: "asc" },
                  select: { s3Key: true },
                })
              )?.s3Key ??
              undefined;
            seedUrl = key ? await assetInputUrl(key).catch(() => undefined) : undefined;
          }

          if (needSeed && !seedUrl) {
            logger.warn(`[generate-assets] skip video seg=${seg.id}: ${vidEnum} needs a seed image, none available`);
          } else {
            const opts = buildVideoPromptOptions(idea, videoStyles, ctx);
            await mapLimit(opts, 1, async (opt, idx) => {
              const asset = await prisma.generatedAsset.create({
                data: {
                  projectId,
                  segmentId: seg.id,
                  kind: AssetKind.VIDEO,
                  provider: vidEnum,
                  style: opt.style,
                  optionIndex: idx,
                  prompt: opt.prompt,
                  status: AssetStatus.GENERATING,
                  confidence: idea.priority ?? 0.7,
                },
              });
              try {
                const vid = await videoProvider.generate(opt.prompt, {
                  aspectRatio: "9:16",
                  durationSec: 5,
                  style: opt.style,
                  imageUrl: seedUrl,
                });
                await withTempDir(async (dir) => {
                  const vpath = path.join(dir, "video.mp4");
                  await downloadUrlToFile(vid.url, vpath);
                  const key = s3Keys.asset(projectId, asset.id, "mp4");
                  await putObject(key, await readFile(vpath), "video/mp4");

                  let thumbKey: string | null = null;
                  try {
                    const thumbPath = path.join(dir, "thumb.jpg");
                    await extractFrame(vpath, thumbPath, 1);
                    thumbKey = s3Keys.thumbnail(projectId, asset.id);
                    await putObject(thumbKey, await readFile(thumbPath), "image/jpeg");
                  } catch (e) {
                    logger.warn(`[generate-assets] thumb failed seg=${seg.id}: ${msg(e)}`);
                  }

                  await prisma.generatedAsset.update({
                    where: { id: asset.id },
                    data: {
                      status: AssetStatus.READY,
                      s3Key: key,
                      thumbnailS3Key: thumbKey,
                      width: vid.width || 1080,
                      height: vid.height || 1920,
                      durationSec: vid.durationSec,
                      meta: (vid.meta ?? {}) as Prisma.InputJsonValue,
                    },
                  });
                });
                segmentsWithAssets.add(seg.id);
              } catch (e) {
                await prisma.generatedAsset.update({
                  where: { id: asset.id },
                  data: { status: AssetStatus.FAILED, error: msg(e) },
                });
                logger.warn(`[generate-assets] video failed seg=${seg.id} opt=${idx}: ${msg(e)}`);
              }
            });
          }
        }
      }

      processed++;
      await setProgress(Math.round((processed / segments.length) * 90));
    });

    // Create one pending approval per segment that produced assets.
    if (segmentsWithAssets.size > 0) {
      await prisma.approval.createMany({
        data: [...segmentsWithAssets].map((segmentId) => ({ projectId, segmentId })),
      });
    }

    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.AWAITING_APPROVAL,
        stage: ProcessingStage.ASSETS_GENERATED,
        error: null,
      },
    });

    logger.info(
      `[generate-assets] done project=${projectId} segments=${segments.length} withAssets=${segmentsWithAssets.size} — awaiting approval`,
    );
  });
}
