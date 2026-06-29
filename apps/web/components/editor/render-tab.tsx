"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Check,
  Clapperboard,
  Download,
  FileVideo,
  Loader2,
  Rocket,
  Sparkles,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EXPORT_PRESETS,
  formatBytes,
  formatTimecode,
  RENDER_STATUS_STYLES,
  type ExportCodec,
  type ExportFormat,
  type ExportInfo,
  type ExportPreset,
  type ExportsResponse,
  type RenderInfo,
  type TabProps,
} from "@/components/editor/types";
import { EmptyState, ScoreRing, StorageHint, TabHeading } from "@/components/editor/shared";

const FORMATS: ExportFormat[] = ["MP4", "MOV"];
const CODECS: { value: ExportCodec; label: string }[] = [
  { value: "H264", label: "H.264 (compatible)" },
  { value: "H265", label: "H.265 (smaller)" },
  { value: "AV1", label: "AV1 (modern)" },
];

const POLL_MS = 3000;

function renderIsActive(r: RenderInfo): boolean {
  return (
    r.status === "QUEUED" ||
    r.status === "RENDERING" ||
    r.status === "COMPOSITING" ||
    r.status === "VALIDATING"
  );
}

export function RenderTab({ project, refresh }: TabProps) {
  const [presets, setPresets] = React.useState<Set<ExportPreset>>(
    () => new Set<ExportPreset>(["VERTICAL_HD"]),
  );
  const [format, setFormat] = React.useState<ExportFormat>("MP4");
  const [codec, setCodec] = React.useState<ExportCodec>("H264");
  const [submitting, setSubmitting] = React.useState(false);

  const [exportsList, setExportsList] = React.useState<ExportInfo[] | null>(
    null,
  );

  const renders = project.renders ?? [];
  const anyRenderActive =
    renders.some(renderIsActive) || project.status === "RENDERING";

  const loadExports = React.useCallback(async () => {
    try {
      const data = await apiGet<ExportsResponse>(
        `/api/exports?projectId=${project.id}`,
      );
      setExportsList(data.exports ?? []);
    } catch {
      setExportsList([]);
    }
  }, [project.id]);

  React.useEffect(() => {
    void loadExports();
  }, [loadExports, project.status]);

  // Poll exports (for fresh signed URLs + status) while a render is running.
  React.useEffect(() => {
    if (!anyRenderActive) return;
    const interval = setInterval(() => {
      void loadExports();
      void refresh();
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [anyRenderActive, loadExports, refresh]);

  function togglePreset(p: ExportPreset) {
    setPresets((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      if (next.size === 0) next.add("VERTICAL_HD");
      return next;
    });
  }

  const timelineReady = (project.timelineItems?.length ?? 0) > 0;

  async function startRender() {
    setSubmitting(true);
    try {
      await apiPost("/api/render", {
        projectId: project.id,
        presets: [...presets],
        format,
        codec,
      });
      toast.success("Render started", {
        description: `Producing ${presets.size} ${presets.size === 1 ? "preset" : "presets"}.`,
      });
      await Promise.all([refresh(), loadExports()]);
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        toast.error("A required provider isn't configured", {
          description: err.message,
        });
      } else {
        toast.error("Couldn't start render", {
          description: err instanceof Error ? err.message : "Please try again.",
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  const downloadable = (exportsList ?? []).filter((e) => e.downloadUrl);
  const storageUnconfigured =
    (exportsList?.length ?? 0) > 0 &&
    exportsList!.every((e) => e.downloadUrl == null);

  return (
    <div className="space-y-6">
      <TabHeading
        title="Render & export"
        description="Produce final cuts in your chosen formats."
      />

      {!timelineReady && (
        <Card className="flex items-start gap-3 border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            The timeline isn&apos;t built yet. Approve every segment&apos;s
            visual first — you can still queue a render, but results may be
            empty.
          </span>
        </Card>
      )}

      {/* Render config */}
      <Card className="space-y-5 p-5">
        {/* Presets */}
        <div>
          <p className="mb-3 text-sm font-semibold">Output presets</p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {EXPORT_PRESETS.map((p) => {
              const active = presets.has(p.value);
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => togglePreset(p.value)}
                  aria-pressed={active}
                  className={cn(
                    "relative flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "border-primary/60 bg-primary/10"
                      : "border-border/60 bg-muted/20 hover:border-primary/40",
                  )}
                >
                  <span
                    className={cn(
                      "absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded border transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border",
                    )}
                  >
                    {active && <Check className="h-2.5 w-2.5" />}
                  </span>
                  <span className="text-sm font-semibold">{p.label}</span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {p.dims}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Format + codec */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Container format</label>
            <Select
              value={format}
              onValueChange={(v) => setFormat(v as ExportFormat)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORMATS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Codec</label>
            <Select
              value={codec}
              onValueChange={(v) => setCodec(v as ExportCodec)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CODECS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border/50 pt-4">
          <p className="text-xs text-muted-foreground">
            {presets.size} {presets.size === 1 ? "preset" : "presets"} ·{" "}
            {format} · {codec}
          </p>
          <Button
            variant="gradient"
            size="lg"
            onClick={startRender}
            disabled={submitting || anyRenderActive}
          >
            {submitting || anyRenderActive ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Rocket className="h-4 w-4" />
            )}
            {anyRenderActive ? "Rendering…" : "Render"}
          </Button>
        </div>
      </Card>

      {/* Renders */}
      <div>
        <TabHeading title="Renders" description="Quality-checked masters." />
        <div className="mt-4">
          {renders.length === 0 ? (
            <EmptyState
              icon={Clapperboard}
              title="No renders yet"
              hint="Start a render above. Progress and a quality score will appear here."
            />
          ) : (
            <div className="space-y-3">
              {renders.map((r, i) => (
                <RenderRow key={r.id} render={r} index={i} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Exports */}
      <div>
        <TabHeading
          title="Exports"
          description={
            downloadable.length > 0
              ? `${downloadable.length} ready to download`
              : undefined
          }
        />
        <div className="mt-4">
          {exportsList === null ? (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : exportsList.length === 0 ? (
            <EmptyState
              icon={FileVideo}
              title="No exports yet"
              hint="Each render produces a downloadable export per preset."
            />
          ) : (
            <div className="space-y-3">
              {storageUnconfigured && <StorageHint />}
              {exportsList.map((e, i) => (
                <ExportRow key={e.id} exp={e} index={i} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RenderRow({ render, index }: { render: RenderInfo; index: number }) {
  const active = renderIsActive(render);
  const progress =
    render.progress <= 1 ? render.progress * 100 : render.progress;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.3) }}
    >
      <Card className="flex items-center gap-4 p-4">
        <ScoreRing score={render.qualityScore} label="QC" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "gap-1 capitalize",
                RENDER_STATUS_STYLES[render.status],
              )}
            >
              {active && <Loader2 className="h-3 w-3 animate-spin" />}
              {render.status.toLowerCase()}
            </Badge>
            {render.width && render.height && (
              <span className="text-xs text-muted-foreground">
                {render.width}×{render.height}
                {render.fps ? ` · ${Math.round(render.fps)}fps` : ""}
              </span>
            )}
            {render.durationSec != null && (
              <span className="text-xs text-muted-foreground">
                · {formatTimecode(render.durationSec)}
              </span>
            )}
          </div>
          {active && (
            <Progress
              value={Math.round(progress)}
              className="mt-2 h-1.5"
              indicatorClassName="animate-pulse"
            />
          )}
          {render.exports && render.exports.length > 0 && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              {render.exports.length}{" "}
              {render.exports.length === 1 ? "export" : "exports"}
            </p>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

function ExportRow({ exp, index }: { exp: ExportInfo; index: number }) {
  const preset = EXPORT_PRESETS.find((p) => p.value === exp.preset);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.3) }}
    >
      <Card className="flex items-center gap-4 p-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/20 to-indigo-500/10 ring-1 ring-inset ring-border/60">
          <FileVideo className="h-5 w-5 text-primary" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {preset?.label ?? exp.preset.replace(/_/g, " ")}
          </p>
          <p className="text-xs text-muted-foreground">
            {exp.width}×{exp.height} · {exp.format} · {exp.codec}
            {exp.sizeBytes ? ` · ${formatBytes(exp.sizeBytes)}` : ""}
          </p>
        </div>
        {exp.downloadUrl ? (
          <Button asChild variant="gradient" size="sm">
            <a href={exp.downloadUrl} download target="_blank" rel="noreferrer">
              <Download className="h-4 w-4" />
              Download
            </a>
          </Button>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            Pending
          </Badge>
        )}
      </Card>
    </motion.div>
  );
}
