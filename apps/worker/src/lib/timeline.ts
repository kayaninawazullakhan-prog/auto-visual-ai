import type { TimelineMeta } from "@ava/types";

export type Track = "VISUAL_TOP" | "FACECAM" | "SUBTITLE" | "AUDIO";
export type ItemType = "FACECAM" | "IMAGE" | "VIDEO" | "ANIMATION" | "CAPTION" | "AUDIO";

export interface ApprovedVisual {
  assetId: string;
  segmentId: string;
  startSec: number;
  endSec: number;
  kind: "IMAGE" | "VIDEO" | "ANIMATION" | "MOTION_GRAPHIC";
}

export interface TimelineInput {
  durationSec: number;
  visuals: ApprovedVisual[];
}

export interface BuiltTimelineItem {
  track: Track;
  type: ItemType;
  startSec: number;
  endSec: number;
  order: number;
  assetId?: string;
  segmentId?: string;
  transition?: TimelineMeta;
  meta?: Record<string, unknown>;
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

function visualType(kind: ApprovedVisual["kind"]): ItemType {
  if (kind === "VIDEO") return "VIDEO";
  if (kind === "ANIMATION" || kind === "MOTION_GRAPHIC") return "ANIMATION";
  return "IMAGE";
}

/**
 * Timeline + word-sync engine (pure). Produces:
 *  - an AUDIO bed and a full-duration FACECAM (bottom section), and
 *  - VISUAL_TOP items placed at each approved segment's word-derived time range,
 *    stretched edge-to-edge so the top section is always filled (no gaps).
 *
 * Segment boundaries come from Whisper word timings, so visuals are inherently
 * word-aligned; captions (Phase 6) add per-word highlighting on top.
 */
export function buildTimeline(input: TimelineInput): BuiltTimelineItem[] {
  const dur = input.durationSec;
  const items: BuiltTimelineItem[] = [
    { track: "AUDIO", type: "AUDIO", startSec: 0, endSec: dur, order: 0, meta: { volume: 1 } },
    { track: "FACECAM", type: "FACECAM", startSec: 0, endSec: dur, order: 0 },
  ];

  const sorted = input.visuals
    .filter((v) => v.endSec > v.startSec)
    .sort((a, b) => a.startSec - b.startSec);

  sorted.forEach((v, i) => {
    const start = i === 0 ? 0 : v.startSec;
    const end = i === sorted.length - 1 ? dur : sorted[i + 1]!.startSec;
    const type = visualType(v.kind);
    items.push({
      track: "VISUAL_TOP",
      type,
      startSec: clamp(start, 0, dur),
      endSec: clamp(end, 0, dur),
      order: i,
      assetId: v.assetId,
      segmentId: v.segmentId,
      transition: {
        enter: { type: "fade", durationSec: 0.3 },
        exit: { type: "fade", durationSec: 0.3 },
        // Subtle Ken Burns on stills for life; videos play natively.
        ...(type === "IMAGE" ? { kenBurns: { fromScale: 1.0, toScale: 1.08 } } : {}),
      },
    });
  });

  return items.filter((it) => it.endSec > it.startSec);
}
