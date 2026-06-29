"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { HardDriveDownload, Inbox } from "lucide-react";

import { cn } from "@/lib/utils";

/** Reusable empty state for tabs (icon + title + hint + optional action). */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  hint,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border/60 bg-card/30 px-6 py-16 text-center",
        className,
      )}
    >
      <div className="relative">
        <div className="absolute inset-0 rounded-2xl bg-primary/20 blur-2xl" />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-500/10 ring-1 ring-inset ring-border/60">
          <Icon className="h-6 w-6 text-primary" />
        </div>
      </div>
      <div className="max-w-sm space-y-1.5">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
      {action}
    </motion.div>
  );
}

/** Shown when presigned URLs are null because S3 isn't configured. */
export function StorageHint({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200",
        className,
      )}
    >
      <HardDriveDownload className="h-4 w-4 shrink-0" />
      <span className="flex-1">
        Storage isn&apos;t configured, so media previews are unavailable. Add
        your AWS S3 keys in{" "}
        <Link
          href="/settings"
          className="font-medium text-amber-100 underline underline-offset-2 hover:text-white"
        >
          Settings
        </Link>{" "}
        to enable downloads and previews.
      </span>
    </div>
  );
}

/** Section heading used at the top of each tab. */
export function TabHeading({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {description && (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Circular progress ring for quality scores (0–100). */
export function ScoreRing({
  score,
  size = 56,
  label,
}: {
  score: number | null | undefined;
  size?: number;
  label?: string;
}) {
  const pct =
    score == null || Number.isNaN(score)
      ? null
      : Math.max(0, Math.min(100, score <= 1 ? score * 100 : score));
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const offset = pct == null ? circ : circ * (1 - pct / 100);
  const color =
    pct == null
      ? "stroke-muted-foreground"
      : pct >= 80
        ? "stroke-emerald-400"
        : pct >= 60
          ? "stroke-amber-400"
          : "stroke-rose-400";

  return (
    <div
      className="relative flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={4}
          className="stroke-muted/60"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={4}
          strokeLinecap="round"
          className={color}
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {pct == null ? "—" : Math.round(pct)}
        </span>
        {label && (
          <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
