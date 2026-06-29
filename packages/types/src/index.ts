/**
 * @ava/types — Shared domain types & DTOs for AUTO VISUAL AI.
 *
 * These describe the shapes of the JSON columns in the Prisma schema and the
 * payloads passed between the web app, the worker, and provider adapters.
 * The Prisma `*.schema` comments point here by name (e.g. "see @ava/types Word").
 */

// ===========================================================================
// Transcription
// ===========================================================================

/** One word with its timing, as produced by Whisper/WhisperX. */
export interface Word {
  word: string;
  start: number; // seconds
  end: number; // seconds
  confidence?: number; // 0..1
}

export interface TranscriptResult {
  language: string;
  text: string;
  segments: Array<{
    index: number;
    text: string;
    start: number;
    end: number;
    words: Word[];
  }>;
}

/** ffprobe-derived metadata stored on Video.metadata. */
export interface ProbeMetadata {
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  audioCodec?: string;
  bitrate?: number;
  hasAudio: boolean;
  raw?: unknown; // full ffprobe JSON
}

// ===========================================================================
// AI understanding
// ===========================================================================

export interface EmotionTag {
  label: string; // e.g. "excitement", "concern"
  score: number; // 0..1
}

/** A concrete visual to generate, derived from a sentence. */
export interface VisualIdea {
  description: string; // natural-language idea, e.g. "Tesla humanoid robot on stage"
  assetKind: "IMAGE" | "VIDEO" | "ANIMATION" | "MOTION_GRAPHIC";
  styles: AssetStyleName[]; // requested style variants
  /** Word or phrase that should trigger this visual, for exact sync. */
  anchorPhrase?: string;
  anchorStart?: number; // seconds
  anchorEnd?: number; // seconds
  priority?: number; // 0..1, ranks competing ideas
}

export type AssetStyleName =
  | "PHOTOREALISTIC"
  | "ULTRA_REALISTIC"
  | "CINEMATIC"
  | "DOCUMENTARY"
  | "COMMERCIAL"
  | "B_ROLL"
  | "MOTION_GRAPHICS";

export type KeywordKindName =
  | "KEYWORD"
  | "ENTITY"
  | "OBJECT"
  | "LOCATION"
  | "ACTION"
  | "EMOTION";

/** Full per-sentence analysis returned by an UnderstandingProvider. */
export interface SegmentAnalysis {
  topic: string;
  intent: string;
  meaning: string;
  context: string;
  keywords: Array<{ text: string; kind: KeywordKindName; confidence: number }>;
  emotions: EmotionTag[];
  visualIdeas: VisualIdea[];
}

// ===========================================================================
// Generation
// ===========================================================================

export interface GenerationOptions {
  width?: number;
  height?: number;
  aspectRatio?: "9:16" | "16:9" | "1:1";
  durationSec?: number; // video only
  style?: AssetStyleName;
  seed?: number;
  negativePrompt?: string;
  /** Seed/init image URL for image-to-video providers (e.g. Runway). */
  imageUrl?: string;
  /** Minimum acceptable provider quality (maps to steps/guidance per provider). */
  quality?: "standard" | "high" | "ultra";
}

export interface GeneratedImage {
  url: string; // provider URL or temp location before S3 copy
  width: number;
  height: number;
  seed?: number;
  meta?: AssetMeta;
}

export interface GeneratedVideo {
  url: string;
  width: number;
  height: number;
  durationSec: number;
  meta?: AssetMeta;
}

/** Provider bookkeeping stored on GeneratedAsset.meta. */
export interface AssetMeta {
  providerRequestId?: string;
  seed?: number;
  model?: string;
  costUsd?: number;
  latencyMs?: number;
  raw?: unknown;
}

// ===========================================================================
// Timeline
// ===========================================================================

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface KenBurns {
  fromScale: number;
  toScale: number;
  fromX?: number;
  fromY?: number;
  toX?: number;
  toY?: number;
}

/** Stored on TimelineItem.transition / .meta. */
export interface TimelineMeta {
  enter?: { type: "fade" | "slide" | "zoom" | "none"; durationSec: number };
  exit?: { type: "fade" | "slide" | "zoom" | "none"; durationSec: number };
  kenBurns?: KenBurns;
  crop?: CropRect; // for facecam framing
  volume?: number; // audio track
}

// ===========================================================================
// Subtitles / captions
// ===========================================================================

export type CaptionStyleName =
  | "WORD_LEVEL"
  | "KARAOKE"
  | "TIKTOK"
  | "REELS"
  | "SHORTS"
  | "HORMOZI";

export type CaptionAnimationName =
  | "POP"
  | "ZOOM"
  | "BOUNCE"
  | "FADE"
  | "SLIDE"
  | "SCALE"
  | "GLOW";

/** A caption word with highlight + optional emoji, stored on Subtitle.words. */
export interface CaptionWord {
  word: string;
  start: number;
  end: number;
  highlight?: boolean; // active-word emphasis
  emoji?: string;
}

/** Stored on Subtitle.meta. */
export interface SubtitleMeta {
  fontFamily?: string;
  fontSizePx?: number;
  primaryColor?: string;
  highlightColor?: string;
  strokeColor?: string;
  strokeWidthPx?: number;
  maxLines?: number;
  maxCharsPerLine?: number;
  positionY?: number; // 0..1 from top of caption area
  uppercase?: boolean;
}

// ===========================================================================
// Branding
// ===========================================================================

export interface BrandColors {
  primary?: string;
  secondary?: string;
  accent?: string;
  text?: string;
  background?: string;
}

export interface BrandPlacement {
  logo?: { corner: "tl" | "tr" | "bl" | "br"; marginPx: number; widthPx: number; opacity: number };
  watermark?: { opacity: number; tiled?: boolean };
  handlePosition?: "top" | "bottom";
}

// ===========================================================================
// Quality validation
// ===========================================================================

export interface QualityCheck {
  name:
    | "resolution"
    | "bitrate"
    | "frameRate"
    | "imageClarity"
    | "faceClarity"
    | "audioClarity"
    | "subtitleClarity"
    | "compressionArtifacts";
  score: number; // 0..100
  passed: boolean;
  detail?: string;
}

export interface QualityReport {
  overall: number; // 0..100
  passed: boolean; // overall >= QUALITY_MIN_SCORE
  checks: QualityCheck[];
  /** Recommended remediation when failed. */
  action?: "regenerate" | "upscale" | "rerender" | "none";
}

// ===========================================================================
// Export presets
// ===========================================================================

export interface ExportDimensions {
  width: number;
  height: number;
}

export const EXPORT_PRESET_DIMENSIONS: Record<string, ExportDimensions> = {
  VERTICAL_HD: { width: 1080, height: 1920 },
  VERTICAL_4K: { width: 2160, height: 3840 },
  HORIZONTAL_4K: { width: 3840, height: 2160 },
  SQUARE: { width: 1080, height: 1080 },
};

// ===========================================================================
// Queue job payloads (BullMQ)
// ===========================================================================

export interface BaseJobData {
  projectId: string;
}

export type ExtractAudioJob = BaseJobData;
export type TranscribeJob = BaseJobData;
export type AnalyzeJob = BaseJobData;
export interface GenerateAssetsJob extends BaseJobData {
  /** Limit to specific segments (e.g. on regenerate); empty = all. */
  segmentIds?: string[];
}
export type BuildTimelineJob = BaseJobData;
export interface SubtitlesJob extends BaseJobData {
  /** Caption strategy: English (default), Original audio language, or Dual. */
  mode?: "ENGLISH" | "ORIGINAL" | "DUAL";
  /** Caption visual style. */
  style?: CaptionStyleName;
  /** Extra translated caption tracks beyond the primary mode. */
  languages?: string[];
}
export interface RenderJob extends BaseJobData {
  renderId: string;
}
export interface QualityCheckJob extends BaseJobData {
  renderId: string;
}
export interface ExportJob extends BaseJobData {
  renderId: string;
  presets: string[];
  format?: "MP4" | "MOV";
  codec?: "H264" | "H265" | "AV1";
}

export type QueueName =
  | "extract-audio"
  | "transcribe"
  | "analyze"
  | "generate-assets"
  | "build-timeline"
  | "subtitles"
  | "render"
  | "quality-check"
  | "export";

// ===========================================================================
// API DTOs (subset; expanded per endpoint in later phases)
// ===========================================================================

export interface CreateUploadRequest {
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface CreateUploadResponse {
  projectId: string;
  videoId: string;
  uploadUrl: string; // presigned PUT (or multipart init)
  s3Key: string;
}

export interface ApiError {
  error: string;
  code?: string;
  details?: unknown;
}
