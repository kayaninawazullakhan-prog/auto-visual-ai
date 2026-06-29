import { Queue, type JobsOptions } from "bullmq";
import type {
  QueueName,
  ExtractAudioJob,
  TranscribeJob,
  AnalyzeJob,
  GenerateAssetsJob,
  BuildTimelineJob,
  SubtitlesJob,
  RenderJob,
  QualityCheckJob,
  ExportJob,
} from "@ava/types";
import { getConnection } from "./connection.js";

export const QUEUE_NAMES: QueueName[] = [
  "extract-audio",
  "transcribe",
  "analyze",
  "generate-assets",
  "build-timeline",
  "subtitles",
  "render",
  "quality-check",
  "export",
];

const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: { age: 60 * 60 * 24, count: 1000 },
  removeOnFail: { age: 60 * 60 * 24 * 7 },
};

const registry = new Map<QueueName, Queue>();

export function getQueue(name: QueueName): Queue {
  let q = registry.get(name);
  if (!q) {
    q = new Queue(name, { connection: getConnection(), defaultJobOptions });
    registry.set(name, q);
  }
  return q;
}

/** Generic enqueue. Prefer the typed `pipeline.*` helpers below. */
export function enqueue<T>(name: QueueName, data: T, opts?: JobsOptions) {
  return getQueue(name).add(name, data as object, opts);
}

/** Typed entry points for each pipeline stage. */
export const pipeline = {
  extractAudio: (d: ExtractAudioJob, o?: JobsOptions) => enqueue("extract-audio", d, o),
  transcribe: (d: TranscribeJob, o?: JobsOptions) => enqueue("transcribe", d, o),
  analyze: (d: AnalyzeJob, o?: JobsOptions) => enqueue("analyze", d, o),
  generateAssets: (d: GenerateAssetsJob, o?: JobsOptions) => enqueue("generate-assets", d, o),
  buildTimeline: (d: BuildTimelineJob, o?: JobsOptions) => enqueue("build-timeline", d, o),
  subtitles: (d: SubtitlesJob, o?: JobsOptions) => enqueue("subtitles", d, o),
  render: (d: RenderJob, o?: JobsOptions) => enqueue("render", d, o),
  qualityCheck: (d: QualityCheckJob, o?: JobsOptions) => enqueue("quality-check", d, o),
  export: (d: ExportJob, o?: JobsOptions) => enqueue("export", d, o),
};

export { getConnection } from "./connection.js";
export { Worker, QueueEvents, type Job, type Processor } from "bullmq";
