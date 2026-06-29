import { run, ffmpegBin } from "./ffmpeg.js";

export type TranscodeCodec = "H264" | "H265" | "AV1";

export interface TranscodeOptions {
  width: number;
  height: number;
  fps?: number;
  codec: TranscodeCodec;
  /** Target video bitrate in bits/sec. When omitted, a CRF (quality) mode is used. */
  bitrate?: number;
}

/** Map our codec enum → the ffmpeg encoder name. */
const VIDEO_ENCODER: Record<TranscodeCodec, string> = {
  H264: "libx264",
  H265: "libx265",
  AV1: "libaom-av1",
};

/**
 * Sensible constant-quality defaults per codec when no explicit bitrate is
 * given. H.265/AV1 are more efficient, so they target a higher CRF for a
 * comparable look at a smaller size.
 */
const DEFAULT_CRF: Record<TranscodeCodec, string> = {
  H264: "18",
  H265: "23",
  AV1: "30",
};

/**
 * Transcode `input` → `output`, scaling/padding to exactly `width`x`height`
 * (letterboxed, aspect-ratio preserved) and re-encoding with the requested
 * codec. Audio is re-encoded to AAC 192k. MP4/MOV outputs get `+faststart` so
 * the moov atom is at the front for progressive download/streaming.
 */
export async function transcode(
  input: string,
  output: string,
  opts: TranscodeOptions,
): Promise<void> {
  const { width, height, fps, codec, bitrate } = opts;

  // Scale down to fit, then pad to the exact target dimensions, centered.
  const vf =
    `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;

  const args = ["-y", "-i", input, "-vf", vf, "-c:v", VIDEO_ENCODER[codec]];

  // Quality / rate control: explicit bitrate when provided, else CRF mode.
  if (bitrate && bitrate > 0) {
    args.push("-b:v", String(bitrate));
    // AV1 (libaom) needs CRF cleared to honor a strict bitrate target.
    if (codec === "AV1") args.push("-crf", "0");
  } else {
    args.push("-crf", DEFAULT_CRF[codec]);
    // libaom-av1 defaults to a very slow search; cap it for usable render times.
    if (codec === "AV1") args.push("-b:v", "0", "-cpu-used", "4");
  }

  // Encoder speed/efficiency preset (libaom-av1 uses -cpu-used, set above).
  if (codec === "H264" || codec === "H265") {
    args.push("-preset", "medium");
  }

  if (fps && fps > 0) args.push("-r", String(fps));

  // yuv420p for broad player compatibility.
  args.push("-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k");

  // Streaming-friendly muxing for MP4/MOV containers.
  const isMp4Like = /\.(mp4|mov|m4v)$/i.test(output);
  if (isMp4Like) args.push("-movflags", "+faststart");

  args.push(output);

  await run(ffmpegBin(), args);
}
