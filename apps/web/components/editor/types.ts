/**
 * Client-side types + tiny formatters for the project editor. These mirror the
 * JSON shapes returned by `/api/projects/[id]`, `/api/projects/[id]/media`,
 * `/api/timeline` and `/api/exports`. They are intentionally permissive (lots of
 * optional/`unknown` JSON fields) because the API returns Prisma rows whose JSON
 * columns aren't statically typed — the UI reads them defensively.
 */

import type { ProjectStatus, ProcessingStage } from "@/lib/projects";

export type { ProjectStatus, ProcessingStage };

export type KeywordKind =
  | "KEYWORD"
  | "ENTITY"
  | "OBJECT"
  | "LOCATION"
  | "ACTION"
  | "EMOTION";

export type AssetKind = "IMAGE" | "VIDEO" | "ANIMATION" | "MOTION_GRAPHIC";

export type AssetStatus =
  | "QUEUED"
  | "GENERATING"
  | "READY"
  | "FAILED"
  | "SKIPPED";

export type ApprovalDecision =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "REGENERATE"
  | "EDIT_PROMPT"
  | "SKIPPED";

export type TimelineTrack = "VISUAL_TOP" | "FACECAM" | "SUBTITLE" | "AUDIO";

export type TimelineItemType =
  | "FACECAM"
  | "IMAGE"
  | "VIDEO"
  | "ANIMATION"
  | "CAPTION"
  | "AUDIO";

export type CaptionStyle =
  | "WORD_LEVEL"
  | "KARAOKE"
  | "TIKTOK"
  | "REELS"
  | "SHORTS"
  | "HORMOZI";

export type CaptionAnimation =
  | "POP"
  | "ZOOM"
  | "BOUNCE"
  | "FADE"
  | "SLIDE"
  | "SCALE"
  | "GLOW";

export type LanguageCode =
  | "EN"
  | "HI"
  | "UR"
  | "AR"
  | "ES"
  | "FR"
  | "DE"
  | "PT";

export type RenderStatus =
  | "QUEUED"
  | "RENDERING"
  | "COMPOSITING"
  | "VALIDATING"
  | "DONE"
  | "FAILED";

export type JobStatus = "QUEUED" | "ACTIVE" | "COMPLETED" | "FAILED" | "CANCELED";

export type ExportPreset =
  | "VERTICAL_HD"
  | "VERTICAL_4K"
  | "HORIZONTAL_4K"
  | "SQUARE";
export type ExportFormat = "MP4" | "MOV";
export type ExportCodec = "H264" | "H265" | "AV1";

export interface VideoInfo {
  id?: string;
  originalFilename?: string | null;
  durationSec?: number | null;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  status?: string | null;
  videoCodec?: string | null;
  audioCodec?: string | null;
  sizeBytes?: string | number | null;
}

export interface BrandColors {
  primary?: string | null;
  secondary?: string | null;
  accent?: string | null;
  text?: string | null;
  background?: string | null;
}

export interface BrandingInfo {
  id?: string;
  logoS3Key?: string | null;
  watermarkS3Key?: string | null;
  username?: string | null;
  website?: string | null;
  socialHandle?: string | null;
  brandColors?: BrandColors | null;
  fontFamily?: string | null;
  fontS3Key?: string | null;
}

export interface TranscriptSegment {
  id: string;
  index: number;
  text: string;
  startSec: number;
  endSec: number;
  words?: unknown;
  topic?: string | null;
  intent?: string | null;
  context?: string | null;
  emotions?: unknown;
  visualIdeas?: unknown;
  analyzedAt?: string | null;
}

export interface TranscriptInfo {
  id?: string;
  language?: LanguageCode;
  fullText?: string;
  status?: string;
  segments?: TranscriptSegment[];
}

export interface TopicInfo {
  id: string;
  name: string;
  confidence: number;
  segmentId?: string | null;
}

export interface KeywordInfo {
  id: string;
  text: string;
  kind: KeywordKind;
  confidence: number;
  segmentId?: string | null;
  startSec?: number | null;
  endSec?: number | null;
}

export interface AssetInfo {
  id: string;
  segmentId?: string | null;
  kind: AssetKind;
  provider?: string | null;
  style?: string | null;
  optionIndex: number;
  prompt: string;
  status: AssetStatus;
  confidence: number;
  width?: number | null;
  height?: number | null;
  durationSec?: number | null;
}

export interface ApprovalInfo {
  id: string;
  segmentId?: string | null;
  assetId?: string | null;
  decision: ApprovalDecision;
  note?: string | null;
  editedPrompt?: string | null;
  decidedAt?: string | null;
}

export interface TimelineItemInfo {
  id: string;
  track: TimelineTrack;
  type: TimelineItemType;
  startSec: number;
  endSec: number;
  order: number;
  assetId?: string | null;
  segmentId?: string | null;
  transition?: unknown;
  meta?: unknown;
}

export interface SubtitleInfo {
  id: string;
  segmentId?: string | null;
  language: LanguageCode;
  style: CaptionStyle;
  animation: CaptionAnimation;
  text: string;
  startSec: number;
  endSec: number;
  words?: unknown;
  meta?: unknown;
}

export interface ExportInfo {
  id: string;
  preset: ExportPreset;
  format: ExportFormat;
  codec: ExportCodec;
  width: number;
  height: number;
  sizeBytes?: string | number | null;
  downloadUrl?: string | null;
}

export interface RenderInfo {
  id: string;
  status: RenderStatus;
  progress: number;
  qualityScore?: number | null;
  s3KeyOutput?: string | null;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  durationSec?: number | null;
  createdAt: string;
  exports?: ExportInfo[];
}

export interface JobInfo {
  id: string;
  type: string;
  status: JobStatus;
  progress?: number | null;
  error?: string | null;
  createdAt: string;
}

export interface ProjectDetail {
  id: string;
  title: string;
  description?: string | null;
  status: ProjectStatus;
  stage: ProcessingStage;
  error?: string | null;
  createdAt: string;
  video?: VideoInfo | null;
  branding?: BrandingInfo | null;
  transcript?: TranscriptInfo | null;
  topics?: TopicInfo[];
  keywords?: KeywordInfo[];
  assets?: AssetInfo[];
  approvals?: ApprovalInfo[];
  timelineItems?: TimelineItemInfo[];
  subtitles?: SubtitleInfo[];
  renders?: RenderInfo[];
  exports?: ExportInfo[];
  jobs?: JobInfo[];
}

export interface ProjectDetailResponse {
  project: ProjectDetail;
}

export interface MediaAsset {
  id: string;
  segmentId?: string | null;
  kind: AssetKind;
  status: AssetStatus;
  style?: string | null;
  provider?: string | null;
  optionIndex: number;
  prompt: string;
  confidence: number;
  url: string | null;
  thumbnailUrl: string | null;
  width?: number | null;
  height?: number | null;
  durationSec?: number | null;
}

export interface MediaResponse {
  sourceUrl: string | null;
  latestRenderUrl: string | null;
  assets: MediaAsset[];
}

export interface TimelineResponse {
  items: TimelineItemInfo[];
}

export interface ExportsResponse {
  exports: ExportInfo[];
}

/** Shared prop bag: every tab receives the project + a way to refetch it. */
export interface TabProps {
  project: ProjectDetail;
  refresh: () => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/** Seconds → `m:ss` (or `h:mm:ss`). */
export function formatTimecode(totalSeconds?: number | null): string {
  if (totalSeconds == null || Number.isNaN(totalSeconds)) return "0:00";
  const s = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const mm = hrs > 0 ? String(mins).padStart(2, "0") : String(mins);
  const ss = String(secs).padStart(2, "0");
  return hrs > 0 ? `${hrs}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Bytes (number or numeric string) → human readable. */
export function formatBytes(bytes?: string | number | null): string {
  if (bytes == null) return "—";
  const n = typeof bytes === "string" ? Number(bytes) : bytes;
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

export function formatConfidence(c?: number | null): string {
  if (c == null || Number.isNaN(c)) return "—";
  const pct = c <= 1 ? c * 100 : c;
  return `${Math.round(pct)}%`;
}

export const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  EN: "English",
  HI: "Hindi",
  UR: "Urdu",
  AR: "Arabic",
  ES: "Spanish",
  FR: "French",
  DE: "German",
  PT: "Portuguese",
};

export const KEYWORD_KIND_STYLES: Record<KeywordKind, string> = {
  KEYWORD: "bg-violet-500/15 text-violet-300 border-violet-500/25",
  ENTITY: "bg-sky-500/15 text-sky-300 border-sky-500/25",
  OBJECT: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
  LOCATION: "bg-amber-500/15 text-amber-300 border-amber-500/25",
  ACTION: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/25",
  EMOTION: "bg-rose-500/15 text-rose-300 border-rose-500/25",
};

export const TRACK_LABELS: Record<TimelineTrack, string> = {
  VISUAL_TOP: "AI Visuals",
  FACECAM: "Facecam",
  SUBTITLE: "Captions",
  AUDIO: "Audio",
};

/** Track → block gradient (matches the dark/purple palette). */
export const TRACK_STYLES: Record<
  TimelineTrack,
  { block: string; dot: string }
> = {
  VISUAL_TOP: {
    block: "from-violet-500/80 to-fuchsia-500/70 border-violet-300/30",
    dot: "bg-violet-400",
  },
  FACECAM: {
    block: "from-sky-500/80 to-cyan-500/70 border-sky-300/30",
    dot: "bg-sky-400",
  },
  SUBTITLE: {
    block: "from-amber-500/80 to-orange-500/70 border-amber-300/30",
    dot: "bg-amber-400",
  },
  AUDIO: {
    block: "from-emerald-500/80 to-teal-500/70 border-emerald-300/30",
    dot: "bg-emerald-400",
  },
};

export const CAPTION_STYLES: { value: CaptionStyle; label: string; hint: string }[] = [
  { value: "WORD_LEVEL", label: "Word-level", hint: "One word at a time" },
  { value: "KARAOKE", label: "Karaoke", hint: "Highlight as spoken" },
  { value: "TIKTOK", label: "TikTok", hint: "Bold centered pop" },
  { value: "REELS", label: "Reels", hint: "Clean lower third" },
  { value: "SHORTS", label: "Shorts", hint: "Punchy 2-line" },
  { value: "HORMOZI", label: "Hormozi", hint: "High-contrast yellow" },
];

export const CAPTION_ANIMATIONS: CaptionAnimation[] = [
  "POP",
  "ZOOM",
  "BOUNCE",
  "FADE",
  "SLIDE",
  "SCALE",
  "GLOW",
];

export const ASSET_STATUS_STYLES: Record<AssetStatus, string> = {
  QUEUED: "bg-zinc-500/15 text-zinc-300 border-zinc-500/25",
  GENERATING: "bg-violet-500/15 text-violet-300 border-violet-500/25",
  READY: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
  FAILED: "bg-rose-500/15 text-rose-300 border-rose-500/25",
  SKIPPED: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

export const RENDER_STATUS_STYLES: Record<RenderStatus, string> = {
  QUEUED: "bg-zinc-500/15 text-zinc-300 border-zinc-500/25",
  RENDERING: "bg-indigo-500/15 text-indigo-300 border-indigo-500/25",
  COMPOSITING: "bg-violet-500/15 text-violet-300 border-violet-500/25",
  VALIDATING: "bg-sky-500/15 text-sky-300 border-sky-500/25",
  DONE: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
  FAILED: "bg-rose-500/15 text-rose-300 border-rose-500/25",
};

export const JOB_STATUS_STYLES: Record<JobStatus, string> = {
  QUEUED: "bg-zinc-500/15 text-zinc-300 border-zinc-500/25",
  ACTIVE: "bg-blue-500/15 text-blue-300 border-blue-500/25",
  COMPLETED: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
  FAILED: "bg-rose-500/15 text-rose-300 border-rose-500/25",
  CANCELED: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

export const JOB_TYPE_LABELS: Record<string, string> = {
  EXTRACT_AUDIO: "Extract audio",
  TRANSCRIBE: "Transcribe",
  ANALYZE: "Analyze",
  GENERATE_ASSETS: "Generate visuals",
  BUILD_TIMELINE: "Build timeline",
  SUBTITLES: "Generate captions",
  RENDER: "Render",
  QUALITY_CHECK: "Quality check",
  EXPORT: "Export",
};

export const EXPORT_PRESETS: {
  value: ExportPreset;
  label: string;
  dims: string;
}[] = [
  { value: "VERTICAL_HD", label: "Vertical HD", dims: "1080 × 1920" },
  { value: "VERTICAL_4K", label: "Vertical 4K", dims: "2160 × 3840" },
  { value: "HORIZONTAL_4K", label: "Horizontal 4K", dims: "3840 × 2160" },
  { value: "SQUARE", label: "Square", dims: "1080 × 1080" },
];

/** True while the project (or its renders) are actively progressing — poll. */
export function isPollingStatus(status: ProjectStatus): boolean {
  return (
    status === "UPLOADING" ||
    status === "PROCESSING" ||
    status === "GENERATING" ||
    status === "RENDERING"
  );
}
