import { loadEnv, MissingProviderKeyError } from "@ava/config";
import type { VideoProvider } from "../contracts.js";
import { RunwayVideoProvider } from "./runway.js";
import { KlingVideoProvider } from "./kling.js";
import { PikaVideoProvider } from "./pika.js";
import { ReplicateVideoProvider } from "./replicate.js";

type VideoEnum = "RUNWAY" | "KLING" | "PIKA" | "REPLICATE";
interface VideoPick {
  provider: VideoProvider;
  enum: VideoEnum;
  needsSeed: boolean;
}

const runway = (): VideoPick => ({ provider: new RunwayVideoProvider(), enum: "RUNWAY", needsSeed: true });
const kling = (): VideoPick => ({ provider: new KlingVideoProvider(), enum: "KLING", needsSeed: false });
const pika = (): VideoPick => ({ provider: new PikaVideoProvider(), enum: "PIKA", needsSeed: false });
const replicate = (): VideoPick => ({ provider: new ReplicateVideoProvider(), enum: "REPLICATE", needsSeed: false });

/**
 * Resolve the video provider. Honors VIDEO_PROVIDER when its key is present,
 * otherwise falls back to any video key (Runway → Kling → Pika → Replicate).
 * Replicate makes video available on the single-key Replicate path.
 */
function pickVideo(): VideoPick {
  const env = loadEnv();
  const p = env.VIDEO_PROVIDER;
  const hasKling = !!(env.KLING_ACCESS_KEY && env.KLING_SECRET_KEY);

  if (p === "runway" && env.RUNWAY_API_KEY) return runway();
  if (p === "kling" && hasKling) return kling();
  if (p === "pika" && env.PIKA_API_KEY) return pika();

  if (env.RUNWAY_API_KEY) return runway();
  if (hasKling) return kling();
  if (env.PIKA_API_KEY) return pika();
  if (env.REPLICATE_API_TOKEN) return replicate();

  throw new MissingProviderKeyError("video", [
    "RUNWAY_API_KEY / KLING_* / PIKA_API_KEY / REPLICATE_API_TOKEN",
  ]);
}

export function getVideoProvider(): VideoProvider {
  return pickVideo().provider;
}
export function videoProviderEnum(): VideoEnum {
  return pickVideo().enum;
}
export function videoNeedsSeedImage(): boolean {
  return pickVideo().needsSeed;
}

export { RunwayVideoProvider, KlingVideoProvider, PikaVideoProvider, ReplicateVideoProvider };
