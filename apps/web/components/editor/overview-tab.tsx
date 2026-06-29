"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Film,
  Gauge,
  Loader2,
  Ratio,
  RefreshCw,
  Sparkles,
  Timer,
  Video,
  Wand2,
  XCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  formatBytes,
  formatTimecode,
  JOB_STATUS_STYLES,
  JOB_TYPE_LABELS,
  type JobInfo,
  type MediaResponse,
  type TabProps,
} from "@/components/editor/types";
import { EmptyState, StorageHint, TabHeading } from "@/components/editor/shared";

function jobIcon(status: JobInfo["status"]) {
  switch (status) {
    case "COMPLETED":
      return CheckCircle2;
    case "FAILED":
      return XCircle;
    case "ACTIVE":
      return Loader2;
    case "CANCELED":
      return AlertCircle;
    default:
      return Clock;
  }
}

export function OverviewTab({ project, refresh }: TabProps) {
  const [sourceUrl, setSourceUrl] = React.useState<string | null>(null);
  const [storageReady, setStorageReady] = React.useState<boolean | null>(null);
  const [mediaLoading, setMediaLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setMediaLoading(true);
    apiGet<MediaResponse>(`/api/projects/${project.id}/media`)
      .then((m) => {
        if (cancelled) return;
        setSourceUrl(m.sourceUrl);
        // sourceUrl null + a video present → storage likely unconfigured
        setStorageReady(m.sourceUrl != null || !project.video);
      })
      .catch(() => {
        if (!cancelled) setStorageReady(false);
      })
      .finally(() => {
        if (!cancelled) setMediaLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project.id, project.video, project.status, project.stage]);

  const jobs = project.jobs ?? [];
  const video = project.video;
  const hasVideo = !!video;

  async function runAction(
    endpoint: string,
    label: string,
    successMsg: string,
  ) {
    setBusy(endpoint);
    try {
      await apiPost(endpoint, { projectId: project.id });
      toast.success(successMsg);
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        toast.error("A required provider isn't configured", {
          description: err.message,
          action: {
            label: "Settings",
            onClick: () => {
              window.location.href = "/settings";
            },
          },
        });
      } else {
        toast.error(`Couldn't ${label.toLowerCase()}`, {
          description: err instanceof Error ? err.message : "Please try again.",
        });
      }
    } finally {
      setBusy(null);
    }
  }

  // Contextual actions based on the pipeline stage.
  const canTranscribe = hasVideo;
  const canAnalyze = ["TRANSCRIBED", "ANALYZED", "ASSETS_GENERATED"].includes(
    project.stage,
  );
  const canGenerate = ["ANALYZED", "ASSETS_GENERATED"].includes(project.stage);

  return (
    <div className="space-y-6">
      {/* FAILED banner */}
      {project.status === "FAILED" && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="flex items-start gap-3 border-rose-500/40 bg-rose-500/10 p-4">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-rose-200">
                This project failed
              </p>
              <p className="mt-0.5 text-sm text-rose-200/80">
                {project.error || "The pipeline hit an error. Try re-running a step below."}
              </p>
            </div>
          </Card>
        </motion.div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Source video */}
        <div className="lg:col-span-3">
          <TabHeading
            title="Source video"
            description="The original talking-head upload."
          />
          <Card className="mt-4 overflow-hidden p-0">
            {mediaLoading ? (
              <Skeleton className="aspect-video w-full" />
            ) : !hasVideo ? (
              <div className="p-2">
                <EmptyState
                  icon={Video}
                  title="No video uploaded yet"
                  hint="Upload a video first from the dashboard to start the pipeline."
                />
              </div>
            ) : sourceUrl ? (
              <video
                controls
                preload="metadata"
                src={sourceUrl}
                className="aspect-video w-full bg-black"
              />
            ) : (
              <div className="p-4">
                <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-lg bg-muted/20 text-center">
                  <Film className="h-8 w-8 text-muted-foreground" />
                  <p className="px-6 text-sm text-muted-foreground">
                    {video?.originalFilename || "Video uploaded"} — preview
                    unavailable.
                  </p>
                </div>
                <StorageHint className="mt-4" />
              </div>
            )}
          </Card>
        </div>

        {/* Metadata */}
        <div className="lg:col-span-2">
          <TabHeading title="Details" description="Probe metadata & info." />
          <Card className="mt-4 p-5">
            {hasVideo ? (
              <dl className="space-y-3.5">
                <MetaRow
                  icon={Film}
                  label="Filename"
                  value={video?.originalFilename || "—"}
                  truncate
                />
                <MetaRow
                  icon={Timer}
                  label="Duration"
                  value={
                    video?.durationSec
                      ? formatTimecode(video.durationSec)
                      : "—"
                  }
                />
                <MetaRow
                  icon={Ratio}
                  label="Resolution"
                  value={
                    video?.width && video?.height
                      ? `${video.width} × ${video.height}`
                      : "—"
                  }
                />
                <MetaRow
                  icon={Gauge}
                  label="Frame rate"
                  value={video?.fps ? `${Math.round(video.fps)} fps` : "—"}
                />
                <MetaRow
                  icon={Video}
                  label="Size"
                  value={formatBytes(video?.sizeBytes)}
                />
                {video?.status && (
                  <MetaRow icon={Sparkles} label="Status" value={video.status} />
                )}
              </dl>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Metadata appears once a video is uploaded and probed.
              </p>
            )}
          </Card>
        </div>
      </div>

      {/* Contextual actions */}
      {hasVideo && project.status !== "FAILED" && (
        <Card className="flex flex-wrap items-center gap-3 p-5">
          <div className="mr-auto">
            <p className="text-sm font-semibold">Pipeline controls</p>
            <p className="text-xs text-muted-foreground">
              Manually re-run a stage if you tweaked inputs or it stalled.
            </p>
          </div>
          {canGenerate && (
            <Button
              variant="gradient"
              size="sm"
              disabled={busy !== null}
              onClick={() =>
                runAction(
                  "/api/generate-assets",
                  "Generate visuals",
                  "Visual generation queued",
                )
              }
            >
              {busy === "/api/generate-assets" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              Generate visuals
            </Button>
          )}
          {canAnalyze && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() =>
                runAction("/api/analyze", "Re-analyze", "Analysis queued")
              }
            >
              {busy === "/api/analyze" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Re-analyze
            </Button>
          )}
          {canTranscribe && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() =>
                runAction(
                  "/api/transcribe",
                  "Re-transcribe",
                  "Transcription queued",
                )
              }
            >
              {busy === "/api/transcribe" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Re-transcribe
            </Button>
          )}
        </Card>
      )}

      {/* Re-run on failure */}
      {hasVideo && project.status === "FAILED" && (
        <Card className="flex flex-wrap items-center gap-3 p-5">
          <p className="mr-auto text-sm font-medium">Retry a step</p>
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() =>
              runAction("/api/transcribe", "Re-transcribe", "Transcription queued")
            }
          >
            <RefreshCw className="h-4 w-4" />
            Re-transcribe
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() => runAction("/api/analyze", "Re-analyze", "Analysis queued")}
          >
            <Sparkles className="h-4 w-4" />
            Re-analyze
          </Button>
          <Button
            variant="gradient"
            size="sm"
            disabled={busy !== null}
            onClick={() =>
              runAction(
                "/api/generate-assets",
                "Generate visuals",
                "Visual generation queued",
              )
            }
          >
            <Wand2 className="h-4 w-4" />
            Generate visuals
          </Button>
        </Card>
      )}

      {/* Job timeline */}
      <div>
        <TabHeading
          title="Pipeline activity"
          description="Background jobs, newest first."
        />
        <Card className="mt-4 p-2">
          {jobs.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="No jobs yet"
              hint="Pipeline jobs will appear here as the video is processed."
            />
          ) : (
            <ul className="divide-y divide-border/50">
              {jobs.map((job, i) => {
                const Icon = jobIcon(job.status);
                const spinning = job.status === "ACTIVE";
                const progress =
                  typeof job.progress === "number" ? job.progress : null;
                return (
                  <motion.li
                    key={job.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.3) }}
                    className="flex items-center gap-3 px-3 py-3"
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                        JOB_STATUS_STYLES[job.status],
                      )}
                    >
                      <Icon className={cn("h-4 w-4", spinning && "animate-spin")} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">
                          {JOB_TYPE_LABELS[job.type] ?? job.type}
                        </p>
                        <span className="shrink-0 text-xs capitalize text-muted-foreground">
                          {job.status.toLowerCase()}
                        </span>
                      </div>
                      {progress != null && spinning && (
                        <Progress
                          value={Math.round(progress)}
                          className="mt-1.5 h-1"
                        />
                      )}
                      {job.error && (
                        <p className="mt-1 truncate text-xs text-rose-300">
                          {job.error}
                        </p>
                      )}
                    </div>
                  </motion.li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function MetaRow({
  icon: Icon,
  label,
  value,
  truncate,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  truncate?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </dt>
      <dd
        className={cn(
          "text-sm font-medium text-foreground",
          truncate && "max-w-[55%] truncate",
        )}
        title={truncate ? value : undefined}
      >
        {value}
      </dd>
    </div>
  );
}
