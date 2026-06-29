"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Clock,
  Film,
  ImageIcon,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  STATUS_STYLES,
  STATUS_LABELS,
  STAGE_LABELS,
  stageProgress,
  isActiveStatus,
  type ProjectSummary,
} from "@/lib/projects";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(1, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function ProjectCard({
  project,
  index = 0,
}: {
  project: ProjectSummary;
  index?: number;
}) {
  const pct = stageProgress(project.stage, project.status);
  const active = isActiveStatus(project.status);
  const assets = project._count?.assets ?? 0;
  const renders = project._count?.renders ?? 0;

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
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.05, 0.4) }}
      whileHover={{ y: -4 }}
      className="group h-full"
    >
      <Link
        href={`/projects/${project.id}`}
        aria-label={`Open ${project.title}`}
        className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
      <Card className="relative flex h-full flex-col overflow-hidden p-5 transition-all duration-300 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/10">
        {/* gradient sheen on hover */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/0 via-primary/0 to-primary/0 opacity-0 transition-opacity duration-300 group-hover:from-primary/[0.07] group-hover:opacity-100" />

        <div className="relative flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-indigo-500/10 ring-1 ring-inset ring-border/60">
              <Film className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold leading-tight text-foreground">
                {project.title}
              </h3>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {timeAgo(project.createdAt)}
              </p>
            </div>
          </div>

          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
              STATUS_STYLES[project.status],
            )}
          >
            <StatusIcon
              className={cn("h-3 w-3", active && "animate-spin")}
            />
            {STATUS_LABELS[project.status]}
          </span>
        </div>

        <div className="relative mt-5 flex-1">
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

        <div className="relative mt-5 flex items-center gap-4 border-t border-border/50 pt-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <ImageIcon className="h-3.5 w-3.5" />
            {assets} {assets === 1 ? "asset" : "assets"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Film className="h-3.5 w-3.5" />
            {renders} {renders === 1 ? "render" : "renders"}
          </span>
        </div>
      </Card>
      </Link>
    </motion.div>
  );
}

export default ProjectCard;
