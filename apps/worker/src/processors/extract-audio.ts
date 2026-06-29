import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Job } from "@ava/queue";
import type { ExtractAudioJob } from "@ava/types";
import { prisma, Prisma, VideoStatus, ProcessingStage } from "@ava/db";
import { downloadToFile, putObject, s3Keys } from "@ava/storage";
import { probe, extractAudio as ffmpegExtractAudio } from "@ava/media";
import { pipeline } from "@ava/queue";
import { withJob } from "../lib/run-job.js";
import { withTempDir } from "../lib/files.js";
import { logger } from "../lib/logger.js";

/**
 * Step 2 — download the source from S3, probe metadata, extract a 16 kHz mono
 * WAV, upload it, then chain to transcription.
 */
export async function extractAudio(job: Job<ExtractAudioJob>) {
  const { projectId } = job.data;
  return withJob(projectId, "EXTRACT_AUDIO", async (setProgress) => {
    const video = await prisma.video.findUnique({ where: { projectId } });
    if (!video) throw new Error(`No source video for project ${projectId}`);

    await withTempDir(async (dir) => {
      const ext = video.originalFilename.split(".").pop()?.toLowerCase() || "mp4";
      const srcPath = path.join(dir, `source.${ext}`);
      await downloadToFile(video.s3KeyOriginal, srcPath);
      await setProgress(30);

      const meta = await probe(srcPath);
      await prisma.video.update({
        where: { id: video.id },
        data: {
          durationSec: meta.durationSec,
          width: meta.width,
          height: meta.height,
          fps: meta.fps,
          videoCodec: meta.videoCodec,
          audioCodec: meta.audioCodec ?? null,
          bitrate: meta.bitrate ?? null,
          metadata: (meta.raw ?? {}) as Prisma.InputJsonValue,
          status: VideoStatus.PROBED,
        },
      });
      await setProgress(50);

      if (!meta.hasAudio) throw new Error("Source video has no audio track to transcribe");

      const audioPath = path.join(dir, "audio.wav");
      await ffmpegExtractAudio(srcPath, audioPath);
      await setProgress(80);

      const audioKey = s3Keys.audio(projectId);
      await putObject(audioKey, await readFile(audioPath), "audio/wav");

      await prisma.video.update({
        where: { id: video.id },
        data: { s3KeyAudio: audioKey, status: VideoStatus.AUDIO_EXTRACTED },
      });
      await prisma.project.update({
        where: { id: projectId },
        data: { stage: ProcessingStage.AUDIO_EXTRACTED },
      });
    });

    await pipeline.transcribe({ projectId });
    logger.info(`[extract-audio] done project=${projectId}`);
  });
}
