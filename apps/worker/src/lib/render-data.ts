import { prisma, Language, type TimelineItemType } from "@ava/db";
import { presignDownload } from "@ava/storage";
import type {
  RenderProps,
  RenderVisual,
  RenderCaption,
  RenderBranding,
} from "@ava/render";
import type {
  TimelineMeta,
  CaptionWord,
  SubtitleMeta,
  BrandColors,
} from "@ava/types";

const FPS = 30;
const WIDTH = 1080;
const HEIGHT = 1920;
const SIGN_TTL = 60 * 60 * 6; // 6h — long enough for a render to finish.

/** Map a TimelineItem.type → the RenderVisual.type the composition understands. */
function visualType(type: TimelineItemType): RenderVisual["type"] {
  switch (type) {
    case "VIDEO":
      return "VIDEO";
    case "ANIMATION":
      return "ANIMATION";
    default:
      return "IMAGE";
  }
}

/** Map Subtitle rows → RenderCaption[]; `posOffset` nudges the secondary track. */
function mapCaptions(
  rows: Array<{ startSec: number; endSec: number; animation: string; words: unknown; meta: unknown }>,
  posOffset = 0,
): RenderCaption[] {
  return rows.map((s) => {
    const words = ((s.words as unknown as CaptionWord[]) ?? []).map((w) => ({
      word: w.word,
      start: w.start,
      end: w.end,
      ...(w.highlight !== undefined ? { highlight: w.highlight } : {}),
      ...(w.emoji !== undefined ? { emoji: w.emoji } : {}),
    }));
    const meta = (s.meta as SubtitleMeta | null) ?? {};
    return {
      startSec: s.startSec,
      endSec: s.endSec,
      animation: s.animation,
      words,
      meta: {
        ...(meta.fontFamily !== undefined ? { fontFamily: meta.fontFamily } : {}),
        ...(meta.fontSizePx !== undefined ? { fontSizePx: meta.fontSizePx } : {}),
        ...(meta.primaryColor !== undefined ? { primaryColor: meta.primaryColor } : {}),
        ...(meta.highlightColor !== undefined ? { highlightColor: meta.highlightColor } : {}),
        ...(meta.strokeColor !== undefined ? { strokeColor: meta.strokeColor } : {}),
        ...(meta.strokeWidthPx !== undefined ? { strokeWidthPx: meta.strokeWidthPx } : {}),
        ...(meta.uppercase !== undefined ? { uppercase: meta.uppercase } : {}),
        positionY: (meta.positionY ?? 0.7) + posOffset,
      },
    };
  });
}

/**
 * Assemble the Remotion input props for a project: resolves every S3 key to a
 * time-limited signed URL, orders visuals by start time, and maps subtitles +
 * branding into the render-facing shapes. Run by the render stage (Phase 7).
 */
export async function buildRenderProps(projectId: string): Promise<RenderProps> {
  const [video, project, transcript, items, allSubtitles, branding] = await Promise.all([
    prisma.video.findUnique({ where: { projectId } }),
    prisma.project.findUnique({ where: { id: projectId }, select: { subtitleMode: true } }),
    prisma.transcript.findUnique({ where: { projectId }, select: { language: true } }),
    prisma.timelineItem.findMany({
      where: { projectId, track: "VISUAL_TOP" },
      include: { asset: true },
      orderBy: { startSec: "asc" },
    }),
    prisma.subtitle.findMany({ where: { projectId }, orderBy: { startSec: "asc" } }),
    prisma.branding.findUnique({ where: { projectId } }),
  ]);

  if (!video) throw new Error(`No source video for project ${projectId}`);

  // Resolve caption language strategy. Default: original audio + English subs.
  const mode = project?.subtitleMode ?? "ENGLISH";
  const origLang = transcript?.language ?? Language.EN;
  const primaryLang = mode === "ORIGINAL" ? origLang : Language.EN;
  const secondaryLang =
    mode === "DUAL" && origLang !== Language.EN ? origLang : null;

  const facecamUrl = await presignDownload(video.s3KeyOriginal, SIGN_TTL);

  // --- Visuals (top section): only items backed by a ready asset key. ---
  const visuals: RenderVisual[] = [];
  for (const item of items) {
    const key = item.asset?.s3Key;
    if (!key) continue;
    const transition = (item.transition as TimelineMeta | null) ?? null;
    const url = await presignDownload(key, SIGN_TTL);
    visuals.push({
      url,
      type: visualType(item.type),
      startSec: item.startSec,
      endSec: item.endSec,
      ...(transition?.kenBurns
        ? {
            kenBurns: {
              fromScale: transition.kenBurns.fromScale,
              toScale: transition.kenBurns.toScale,
            },
          }
        : {}),
      ...(transition?.enter ? { enterSec: transition.enter.durationSec } : {}),
      ...(transition?.exit ? { exitSec: transition.exit.durationSec } : {}),
    });
  }

  // --- Captions: select track(s) by subtitle mode (English default). ---
  const captions = mapCaptions(allSubtitles.filter((s) => s.language === primaryLang));
  const secondaryCaptions = secondaryLang
    ? mapCaptions(allSubtitles.filter((s) => s.language === secondaryLang), 0.1)
    : undefined;

  // --- Branding (optional): sign logo/watermark keys, carry colors + handles. ---
  let renderBranding: RenderBranding | undefined;
  if (branding) {
    const colors = (branding.brandColors as BrandColors | null) ?? null;
    const [logoUrl, watermarkUrl] = await Promise.all([
      branding.logoS3Key ? presignDownload(branding.logoS3Key, SIGN_TTL) : undefined,
      branding.watermarkS3Key
        ? presignDownload(branding.watermarkS3Key, SIGN_TTL)
        : undefined,
    ]);
    renderBranding = {
      ...(logoUrl ? { logoUrl } : {}),
      ...(watermarkUrl ? { watermarkUrl } : {}),
      ...(branding.username ? { username: branding.username } : {}),
      ...(branding.website ? { website: branding.website } : {}),
      ...(branding.socialHandle ? { socialHandle: branding.socialHandle } : {}),
      ...(colors?.primary || colors?.accent
        ? {
            colors: {
              ...(colors.primary ? { primary: colors.primary } : {}),
              ...(colors.accent ? { accent: colors.accent } : {}),
            },
          }
        : {}),
    };
  }

  const durationSec = video.durationSec ?? 0;
  const durationInFrames = Math.max(1, Math.round(durationSec * FPS));

  return {
    width: WIDTH,
    height: HEIGHT,
    fps: FPS,
    durationInFrames,
    facecamUrl,
    visuals,
    captions,
    ...(secondaryCaptions ? { secondaryCaptions } : {}),
    ...(renderBranding ? { branding: renderBranding } : {}),
  };
}
