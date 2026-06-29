import type { QueueName } from "@ava/types";
import type { Processor } from "@ava/queue";
import { extractAudio } from "./extract-audio.js";
import { transcribe } from "./transcribe.js";
import { analyze } from "./analyze.js";
import { generateAssets } from "./generate-assets.js";
import { buildTimeline } from "./build-timeline.js";
import { subtitles } from "./subtitles.js";
import { render } from "./render.js";
import { qualityCheck } from "./quality-check.js";
import { exportRender } from "./export.js";

/** Maps each queue to its processor. Stubs are replaced as phases land. */
export const processors: Record<QueueName, Processor> = {
  "extract-audio": extractAudio as Processor,
  transcribe: transcribe as Processor,
  analyze: analyze as Processor,
  "generate-assets": generateAssets as Processor,
  "build-timeline": buildTimeline as Processor,
  subtitles: subtitles as Processor,
  render: render as Processor,
  "quality-check": qualityCheck as Processor,
  export: exportRender as Processor,
};
