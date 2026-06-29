import type { ProbeMetadata, QualityCheck, QualityReport } from "@ava/types";

export interface QualityCheckOptions {
  /** Pass threshold (0..100). Defaults to 95 (mirrors QUALITY_MIN_SCORE). */
  minScore?: number;
  /** Target dimensions the render was supposed to hit (default 1080x1920). */
  targetWidth?: number;
  targetHeight?: number;
  /** Target frame rate (default 30). */
  targetFps?: number;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const round = (n: number) => Math.round(n);

/**
 * Heuristic, ffprobe-only quality assessment of a rendered master. No pixel
 * inspection — scores are derived from resolution, frame rate, bitrate density
 * (bits-per-pixel-per-frame), and the presence of an audio track. Pure function
 * so it can run anywhere a ProbeMetadata is available.
 */
export function assessQuality(
  meta: ProbeMetadata,
  opts: QualityCheckOptions = {},
): QualityReport {
  const minScore = opts.minScore ?? 95;
  const targetW = opts.targetWidth ?? 1080;
  const targetH = opts.targetHeight ?? 1920;
  const targetFps = opts.targetFps ?? 30;

  const checks: QualityCheck[] = [];

  // --- Resolution: full credit at/above target, scaled down by pixel ratio. ---
  const targetPixels = targetW * targetH;
  const actualPixels = meta.width * meta.height;
  const resRatio = targetPixels > 0 ? actualPixels / targetPixels : 0;
  const resolutionScore = clamp(round(resRatio * 100));
  checks.push({
    name: "resolution",
    score: resolutionScore,
    passed: meta.width >= targetW && meta.height >= targetH,
    detail: `${meta.width}x${meta.height} (target ${targetW}x${targetH})`,
  });

  // --- Frame rate: full credit at/above target. ---
  const fpsScore = targetFps > 0 ? clamp(round((meta.fps / targetFps) * 100)) : 0;
  checks.push({
    name: "frameRate",
    score: fpsScore,
    passed: meta.fps + 0.5 >= targetFps, // tolerate 29.97 vs 30 rounding
    detail: `${meta.fps.toFixed(2)} fps (target ${targetFps})`,
  });

  // --- Bitrate: present and reasonably high for the resolution. ---
  // Reference: ~8 Mbps for 1080x1920@30 is a solid social-export bitrate.
  const refBitrate = (targetPixels * targetFps * 0.0000013) || 8_000_000;
  const bitrate = meta.bitrate ?? 0;
  const bitrateScore = bitrate > 0 ? clamp(round((bitrate / refBitrate) * 100)) : 0;
  checks.push({
    name: "bitrate",
    score: bitrateScore,
    passed: bitrate >= refBitrate * 0.6,
    detail: bitrate > 0 ? `${Math.round(bitrate / 1000)} kbps` : "no bitrate reported",
  });

  // --- Compression artifacts: from bits-per-pixel-per-frame density. ---
  // Higher density → fewer artifacts. ~0.1 bpp is visually clean for H.264.
  const bppf =
    actualPixels > 0 && meta.fps > 0 ? bitrate / (actualPixels * meta.fps) : 0;
  const artifactScore = bppf > 0 ? clamp(round((bppf / 0.1) * 100)) : 0;
  checks.push({
    name: "compressionArtifacts",
    score: artifactScore,
    passed: bppf >= 0.05,
    detail: `${bppf.toFixed(4)} bits/pixel/frame`,
  });

  // --- Audio clarity: presence + a recognized codec. ---
  const audioScore = meta.hasAudio ? (meta.audioCodec ? 100 : 80) : 0;
  checks.push({
    name: "audioClarity",
    score: audioScore,
    passed: meta.hasAudio,
    detail: meta.hasAudio
      ? `audio track (${meta.audioCodec ?? "unknown codec"})`
      : "no audio track",
  });

  const overall =
    checks.length > 0
      ? round(checks.reduce((sum, c) => sum + c.score, 0) / checks.length)
      : 0;
  const passed = overall >= minScore;

  // Recommend a remediation when below threshold, based on the weakest area.
  let action: QualityReport["action"] = "none";
  if (!passed) {
    if (resolutionScore < 60) action = "upscale";
    else if (audioScore < 60 || resolutionScore < 80) action = "rerender";
    else action = "rerender";
  }

  return { overall, passed, checks, action };
}
