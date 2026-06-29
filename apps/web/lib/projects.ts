/**
 * Shared client-side types + presentation helpers for projects (status colors,
 * labels, progress %). Kept framework-agnostic so cards and the dashboard agree.
 */

export type ProjectStatus =
  | "DRAFT"
  | "UPLOADING"
  | "PROCESSING"
  | "GENERATING"
  | "AWAITING_APPROVAL"
  | "READY_TO_RENDER"
  | "RENDERING"
  | "COMPLETED"
  | "FAILED";

export type ProcessingStage =
  | "CREATED"
  | "UPLOADED"
  | "AUDIO_EXTRACTED"
  | "TRANSCRIBED"
  | "ANALYZED"
  | "ASSETS_GENERATED"
  | "TIMELINE_BUILT"
  | "SUBTITLES_GENERATED"
  | "APPROVED"
  | "RENDERED"
  | "EXPORTED";

export interface ProjectSummary {
  id: string;
  title: string;
  status: ProjectStatus;
  stage: ProcessingStage;
  createdAt: string;
  video?: {
    id: string;
    originalFilename?: string | null;
    sizeBytes?: string | number | null;
  } | null;
  _count?: {
    assets?: number;
    renders?: number;
    exports?: number;
  } | null;
}

export interface ProjectsResponse {
  projects: ProjectSummary[];
}

/** Tailwind class bundles per status (badge styling). */
export const STATUS_STYLES: Record<ProjectStatus, string> = {
  DRAFT: "bg-zinc-500/15 text-zinc-300 border-zinc-500/20",
  UPLOADING: "bg-sky-500/15 text-sky-300 border-sky-500/20",
  PROCESSING: "bg-blue-500/15 text-blue-300 border-blue-500/20",
  GENERATING: "bg-violet-500/15 text-violet-300 border-violet-500/20",
  AWAITING_APPROVAL: "bg-amber-500/15 text-amber-300 border-amber-500/20",
  READY_TO_RENDER: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/20",
  RENDERING: "bg-indigo-500/15 text-indigo-300 border-indigo-500/20",
  COMPLETED: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  FAILED: "bg-rose-500/15 text-rose-300 border-rose-500/20",
};

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  DRAFT: "Draft",
  UPLOADING: "Uploading",
  PROCESSING: "Processing",
  GENERATING: "Generating",
  AWAITING_APPROVAL: "Needs approval",
  READY_TO_RENDER: "Ready to render",
  RENDERING: "Rendering",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

export const STAGE_LABELS: Record<ProcessingStage, string> = {
  CREATED: "Created",
  UPLOADED: "Uploaded",
  AUDIO_EXTRACTED: "Audio extracted",
  TRANSCRIBED: "Transcribed",
  ANALYZED: "Analyzed",
  ASSETS_GENERATED: "Assets generated",
  TIMELINE_BUILT: "Timeline built",
  SUBTITLES_GENERATED: "Subtitles ready",
  APPROVED: "Approved",
  RENDERED: "Rendered",
  EXPORTED: "Exported",
};

const STAGE_ORDER: ProcessingStage[] = [
  "CREATED",
  "UPLOADED",
  "AUDIO_EXTRACTED",
  "TRANSCRIBED",
  "ANALYZED",
  "ASSETS_GENERATED",
  "TIMELINE_BUILT",
  "SUBTITLES_GENERATED",
  "APPROVED",
  "RENDERED",
  "EXPORTED",
];

/** Rough completion percent derived from the processing stage. */
export function stageProgress(stage: ProcessingStage, status: ProjectStatus): number {
  if (status === "COMPLETED") return 100;
  if (status === "FAILED") return 100;
  const idx = STAGE_ORDER.indexOf(stage);
  if (idx < 0) return 0;
  return Math.round(((idx + 1) / STAGE_ORDER.length) * 100);
}

/** Whether a project is mid-pipeline (used to animate the progress bar). */
export function isActiveStatus(status: ProjectStatus): boolean {
  return (
    status === "UPLOADING" ||
    status === "PROCESSING" ||
    status === "GENERATING" ||
    status === "RENDERING"
  );
}
