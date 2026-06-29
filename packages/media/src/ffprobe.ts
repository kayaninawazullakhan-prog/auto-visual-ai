import type { ProbeMetadata } from "@ava/types";
import { run, ffprobeBin } from "./ffmpeg.js";

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  duration?: string;
}
interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: { duration?: string; bit_rate?: string };
}

function evalFraction(s: string | undefined): number {
  if (!s) return 0;
  const [n, d] = s.split("/").map(Number);
  if (!n) return 0;
  return d ? n / d : n;
}

/** Probe a media file into structured metadata (see @ava/types ProbeMetadata). */
export async function probe(inputPath: string): Promise<ProbeMetadata> {
  const { stdout } = await run(ffprobeBin(), [
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    inputPath,
  ]);

  const data = JSON.parse(stdout) as FfprobeOutput;
  const streams = data.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video");
  const audio = streams.find((s) => s.codec_type === "audio");

  return {
    durationSec:
      parseFloat(data.format?.duration ?? video?.duration ?? "0") || 0,
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    fps: evalFraction(video?.r_frame_rate),
    videoCodec: video?.codec_name ?? "",
    audioCodec: audio?.codec_name,
    bitrate: data.format?.bit_rate ? parseInt(data.format.bit_rate, 10) : undefined,
    hasAudio: !!audio,
    raw: data,
  };
}
