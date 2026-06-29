"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { LayoutList } from "lucide-react";

import { cn } from "@/lib/utils";
import { apiGet } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  formatTimecode,
  TRACK_LABELS,
  TRACK_STYLES,
  type TabProps,
  type TimelineItemInfo,
  type TimelineResponse,
  type TimelineTrack,
} from "@/components/editor/types";
import { EmptyState, StorageHint, TabHeading } from "@/components/editor/shared";

const TRACK_ORDER: TimelineTrack[] = [
  "VISUAL_TOP",
  "FACECAM",
  "SUBTITLE",
  "AUDIO",
];

export function TimelineTab({ project }: TabProps) {
  const [items, setItems] = React.useState<TimelineItemInfo[] | null>(
    project.timelineItems ?? null,
  );
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const data = await apiGet<TimelineResponse>(
        `/api/timeline?projectId=${project.id}`,
      );
      setItems(data.items ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load timeline");
      // fall back to whatever came with the project payload
      setItems((prev) => prev ?? project.timelineItems ?? []);
    }
  }, [project.id, project.timelineItems]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const byTrack = React.useMemo(() => {
    const map = new Map<TimelineTrack, TimelineItemInfo[]>();
    for (const t of TRACK_ORDER) map.set(t, []);
    for (const item of items ?? []) {
      const arr = map.get(item.track);
      if (arr) arr.push(item);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.startSec - b.startSec);
    return map;
  }, [items]);

  // Total duration drives the proportional layout.
  const duration = React.useMemo(() => {
    const fromItems = (items ?? []).reduce(
      (max, i) => Math.max(max, i.endSec),
      0,
    );
    return Math.max(fromItems, project.video?.durationSec ?? 0, 1);
  }, [items, project.video?.durationSec]);

  if (items === null) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Card className="space-y-4 p-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </Card>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="space-y-4">
        {error && <StorageHint />}
        <EmptyState
          icon={LayoutList}
          title="Timeline not built yet"
          hint="The timeline is assembled automatically once every segment's visual is approved. Approve your visuals to see the cut here."
        />
      </div>
    );
  }

  // Ruler ticks (~6 evenly spaced markers).
  const tickCount = 6;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) =>
    Math.round((duration / tickCount) * i),
  );

  return (
    <div className="space-y-6">
      <TabHeading
        title="Timeline"
        description={`${items.length} items · ${formatTimecode(duration)} total · read-only preview`}
      />

      <Card className="overflow-hidden p-4 sm:p-6">
        {/* Time ruler */}
        <div className="mb-3 flex pl-24">
          <div className="relative h-5 flex-1">
            {ticks.map((t, i) => (
              <div
                key={i}
                className="absolute top-0 -translate-x-1/2 text-[10px] tabular-nums text-muted-foreground"
                style={{ left: `${(t / duration) * 100}%` }}
              >
                {formatTimecode(t)}
              </div>
            ))}
          </div>
        </div>

        {/* Tracks */}
        <div className="space-y-2.5">
          {TRACK_ORDER.map((track, ti) => {
            const trackItems = byTrack.get(track) ?? [];
            const styles = TRACK_STYLES[track];
            return (
              <div key={track} className="flex items-center gap-3">
                {/* Track label */}
                <div className="flex w-24 shrink-0 items-center gap-1.5">
                  <span
                    className={cn("h-2 w-2 shrink-0 rounded-full", styles.dot)}
                  />
                  <span className="truncate text-xs font-medium text-muted-foreground">
                    {TRACK_LABELS[track]}
                  </span>
                </div>

                {/* Lane */}
                <div className="relative h-10 flex-1 overflow-hidden rounded-lg border border-border/40 bg-muted/20">
                  {/* subtle gridlines */}
                  {ticks.map((t, i) => (
                    <div
                      key={i}
                      className="absolute top-0 h-full w-px bg-border/20"
                      style={{ left: `${(t / duration) * 100}%` }}
                    />
                  ))}

                  {trackItems.length === 0 ? (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/60">
                      empty
                    </span>
                  ) : (
                    trackItems.map((item) => {
                      const leftPct = (item.startSec / duration) * 100;
                      const widthPct = Math.max(
                        ((item.endSec - item.startSec) / duration) * 100,
                        1.2,
                      );
                      return (
                        <Tooltip key={item.id}>
                          <TooltipTrigger asChild>
                            <motion.div
                              initial={{ opacity: 0, scaleX: 0.6 }}
                              animate={{ opacity: 1, scaleX: 1 }}
                              transition={{
                                delay: Math.min(ti * 0.05, 0.3),
                                duration: 0.3,
                              }}
                              style={{
                                left: `${leftPct}%`,
                                width: `${widthPct}%`,
                                transformOrigin: "left",
                              }}
                              className={cn(
                                "absolute top-1 flex h-8 cursor-default items-center overflow-hidden rounded-md border bg-gradient-to-r px-1.5 shadow-sm transition-transform hover:z-10 hover:scale-[1.02]",
                                styles.block,
                              )}
                            >
                              <span className="truncate text-[10px] font-medium text-white/95">
                                {item.type.replace(/_/g, " ").toLowerCase()}
                              </span>
                            </motion.div>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p className="font-medium capitalize">
                              {item.type.replace(/_/g, " ").toLowerCase()} ·{" "}
                              {TRACK_LABELS[track]}
                            </p>
                            <p className="text-muted-foreground">
                              {formatTimecode(item.startSec)} –{" "}
                              {formatTimecode(item.endSec)} (
                              {(item.endSec - item.startSec).toFixed(1)}s)
                            </p>
                            {typeof item.transition === "string" &&
                              item.transition && (
                                <p className="text-muted-foreground">
                                  Transition: {item.transition}
                                </p>
                              )}
                          </TooltipContent>
                        </Tooltip>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/50 pt-4">
          {TRACK_ORDER.map((track) => (
            <span
              key={track}
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <span
                className={cn(
                  "h-2.5 w-2.5 rounded-sm bg-gradient-to-r",
                  TRACK_STYLES[track].block,
                )}
              />
              {TRACK_LABELS[track]}
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
}
