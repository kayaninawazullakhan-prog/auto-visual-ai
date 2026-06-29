"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clapperboard,
  FileText,
  ImageIcon,
  LayoutList,
  Loader2,
  Palette,
  Captions,
  Rocket,
  Clock,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { apiGet, ApiError } from "@/lib/api-client";
import {
  STATUS_STYLES,
  STATUS_LABELS,
  STAGE_LABELS,
  stageProgress,
  isActiveStatus,
} from "@/lib/projects";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  isPollingStatus,
  type ProjectDetail,
  type ProjectDetailResponse,
} from "@/components/editor/types";
import { OverviewTab } from "@/components/editor/overview-tab";
import { TranscriptTab } from "@/components/editor/transcript-tab";
import { ApprovalTab } from "@/components/editor/approval-tab";
import { CaptionsTab } from "@/components/editor/captions-tab";
import { BrandingTab } from "@/components/editor/branding-tab";
import { TimelineTab } from "@/components/editor/timeline-tab";
import { RenderTab } from "@/components/editor/render-tab";

const TABS = [
  { value: "overview", label: "Overview", icon: Clapperboard },
  { value: "transcript", label: "Transcript", icon: FileText },
  { value: "approval", label: "Visuals & Approval", icon: ImageIcon },
  { value: "captions", label: "Captions", icon: Captions },
  { value: "branding", label: "Branding", icon: Palette },
  { value: "timeline", label: "Timeline", icon: LayoutList },
  { value: "render", label: "Render & Export", icon: Rocket },
] as const;

const POLL_MS = 3000;

/** Map a tab value to its panel component. */
function renderTab(
  value: string,
  project: ProjectDetail,
  refresh: () => Promise<void>,
) {
  switch (value) {
    case "overview":
      return <OverviewTab project={project} refresh={refresh} />;
    case "transcript":
      return <TranscriptTab project={project} refresh={refresh} />;
    case "approval":
      return <ApprovalTab project={project} refresh={refresh} />;
    case "captions":
      return <CaptionsTab project={project} refresh={refresh} />;
    case "branding":
      return <BrandingTab project={project} refresh={refresh} />;
    case "timeline":
      return <TimelineTab project={project} refresh={refresh} />;
    case "render":
      return <RenderTab project={project} refresh={refresh} />;
    default:
      return null;
  }
}

export default function ProjectEditorPage() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id;

  const [project, setProject] = React.useState<ProjectDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<string>("overview");

  // keep the latest status in a ref so the poll loop reads fresh values
  const statusRef = React.useRef<ProjectDetail["status"] | null>(null);

  const load = React.useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await apiGet<ProjectDetailResponse>(
        `/api/projects/${projectId}`,
      );
      setProject(data.project);
      statusRef.current = data.project.status;
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError("not-found");
      } else {
        setError(err instanceof Error ? err.message : "Failed to load project");
      }
    }
  }, [projectId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  // Poll while the project is actively progressing; stop on terminal/idle.
  React.useEffect(() => {
    if (!project) return;
    if (!isPollingStatus(project.status)) return;
    const interval = setInterval(() => {
      if (statusRef.current && isPollingStatus(statusRef.current)) {
        void load();
      }
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [project, load]);

  if (error === "not-found") {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/15 ring-1 ring-inset ring-rose-500/20">
          <AlertCircle className="h-7 w-7 text-rose-300" />
        </div>
        <h1 className="mt-5 text-xl font-semibold">Project not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This project doesn&apos;t exist or you don&apos;t have access to it.
        </p>
        <Button asChild variant="gradient" className="mt-6">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
        </Button>
      </div>
    );
  }

  if (!project && error) {
    return (
      <div className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 lg:px-8">
        <Card className="flex items-center gap-3 border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6 lg:px-8">
        {project ? (
          <ProjectHeader project={project} />
        ) : (
          <HeaderSkeleton />
        )}

        <div className="mt-8">
          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
              <TabsList className="relative h-auto w-max gap-1 p-1">
                {TABS.map((t) => {
                  const Icon = t.icon;
                  const active = tab === t.value;
                  return (
                    <TabsTrigger
                      key={t.value}
                      value={t.value}
                      className="relative gap-2 data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:shadow-none"
                    >
                      {active && (
                        <motion.span
                          layoutId="editor-active-tab"
                          className="absolute inset-0 rounded-md bg-gradient-to-r from-violet-600/90 via-primary/90 to-indigo-500/90 shadow-lg shadow-primary/30"
                          transition={{
                            type: "spring",
                            stiffness: 380,
                            damping: 32,
                          }}
                        />
                      )}
                      <Icon className="relative z-10 h-4 w-4" />
                      <span className="relative z-10 hidden sm:inline">
                        {t.label}
                      </span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </div>

            {!project ? (
              <div className="mt-6 space-y-4">
                <Skeleton className="h-64 w-full rounded-xl" />
                <Skeleton className="h-40 w-full rounded-xl" />
              </div>
            ) : (
              TABS.map((t) => (
                <TabsContent
                  key={t.value}
                  value={t.value}
                  forceMount
                  className="mt-6 data-[state=inactive]:hidden"
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {tab === t.value && (
                      <motion.div
                        key={t.value}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.2 }}
                      >
                        {renderTab(t.value, project, load)}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </TabsContent>
              ))
            )}
          </Tabs>
        </div>
      </div>
    </TooltipProvider>
  );
}

function ProjectHeader({ project }: { project: ProjectDetail }) {
  const pct = stageProgress(project.stage, project.status);
  const active = isActiveStatus(project.status);
  const StatusIcon =
    project.status === "COMPLETED"
      ? CheckCircle2
      : project.status === "FAILED"
        ? AlertCircle
        : active
          ? Loader2
          : Clock;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to projects
      </Link>

      <div className="mt-4 flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/40 p-6 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">
              {project.title}
            </h1>
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                STATUS_STYLES[project.status],
              )}
            >
              <StatusIcon className={cn("h-3 w-3", active && "animate-spin")} />
              {STATUS_LABELS[project.status]}
            </span>
          </div>
          {project.description && (
            <p className="mt-1.5 max-w-2xl truncate text-sm text-muted-foreground">
              {project.description}
            </p>
          )}
        </div>

        <div className="w-full shrink-0 sm:w-64">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-medium text-muted-foreground">
              {STAGE_LABELS[project.stage]}
            </span>
            <span className="tabular-nums text-muted-foreground">{pct}%</span>
          </div>
          <Progress
            value={pct}
            indicatorClassName={cn(
              project.status === "FAILED" &&
                "from-rose-500 via-rose-500 to-rose-400",
              project.status === "COMPLETED" &&
                "from-emerald-500 via-emerald-500 to-emerald-400",
              active && "animate-pulse",
            )}
          />
        </div>
      </div>
    </motion.div>
  );
}

function HeaderSkeleton() {
  return (
    <div>
      <Skeleton className="h-4 w-32" />
      <div className="mt-4 flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/40 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-10 w-full sm:w-64" />
      </div>
    </div>
  );
}
