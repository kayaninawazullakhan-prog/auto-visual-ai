"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Check,
  CheckCircle2,
  ImageIcon,
  Loader2,
  Maximize2,
  Pencil,
  RefreshCw,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatConfidence,
  formatTimecode,
  type ApprovalDecision,
  type MediaAsset,
  type MediaResponse,
  type TabProps,
  type TranscriptSegment,
} from "@/components/editor/types";
import { EmptyState, StorageHint, TabHeading } from "@/components/editor/shared";

interface DecisionPayload {
  assetId?: string;
  segmentId?: string;
  decision: ApprovalDecision;
  note?: string;
  editedPrompt?: string;
}

export function ApprovalTab({ project, refresh }: TabProps) {
  const [media, setMedia] = React.useState<MediaResponse | null>(null);
  const [mediaError, setMediaError] = React.useState<string | null>(null);
  // optimistic approved-asset overrides: segmentId -> assetId
  const [optimistic, setOptimistic] = React.useState<Record<string, string>>(
    {},
  );
  const [pending, setPending] = React.useState<Set<string>>(new Set());
  const [editing, setEditing] = React.useState<{
    segmentId: string;
    assetId?: string;
    prompt: string;
  } | null>(null);
  const [enlarged, setEnlarged] = React.useState<{
    segment: TranscriptSegment | undefined;
    assets: MediaAsset[];
    focusId: string;
  } | null>(null);

  const loadMedia = React.useCallback(async () => {
    try {
      const m = await apiGet<MediaResponse>(
        `/api/projects/${project.id}/media`,
      );
      setMedia(m);
      setMediaError(null);
    } catch (err) {
      setMediaError(err instanceof Error ? err.message : "Failed to load media");
      setMedia({ sourceUrl: null, latestRenderUrl: null, assets: [] });
    }
  }, [project.id]);

  React.useEffect(() => {
    void loadMedia();
  }, [loadMedia, project.status, project.stage]);

  const segments = project.transcript?.segments ?? [];
  const segmentById = React.useMemo(() => {
    const map = new Map<string, TranscriptSegment>();
    for (const s of segments) map.set(s.id, s);
    return map;
  }, [segments]);

  const approvals = project.approvals ?? [];
  // currently approved asset per segment (server truth)
  const approvedBySegment = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const a of approvals) {
      if (a.decision === "APPROVED" && a.segmentId && a.assetId) {
        map.set(a.segmentId, a.assetId);
      }
    }
    return map;
  }, [approvals]);

  // Group visible assets by segment (skip SKIPPED options so the grid stays clean).
  const assetsBySegment = React.useMemo(() => {
    const map = new Map<string, MediaAsset[]>();
    const list = media?.assets ?? [];
    for (const a of list) {
      if (!a.segmentId) continue;
      if (a.status === "SKIPPED") continue;
      const arr = map.get(a.segmentId) ?? [];
      arr.push(a);
      map.set(a.segmentId, arr);
    }
    for (const arr of map.values())
      arr.sort((x, y) => x.optionIndex - y.optionIndex);
    return map;
  }, [media]);

  // Segments that actually have generated assets, in transcript order.
  const segmentIdsWithAssets = React.useMemo(() => {
    const ordered = segments.filter((s) => assetsBySegment.has(s.id));
    // include orphan segmentIds (assets whose segment isn't in transcript) at the end
    const known = new Set(ordered.map((s) => s.id));
    const extras = [...assetsBySegment.keys()].filter((id) => !known.has(id));
    return [...ordered.map((s) => s.id), ...extras];
  }, [segments, assetsBySegment]);

  const totalSegments = segmentIdsWithAssets.length;
  const approvedCount = segmentIdsWithAssets.filter(
    (sid) => optimistic[sid] ?? approvedBySegment.get(sid),
  ).length;
  const allApproved = totalSegments > 0 && approvedCount === totalSegments;

  const storageUnconfigured =
    (media?.assets.length ?? 0) > 0 &&
    media!.assets.every((a) => a.url == null && a.thumbnailUrl == null);

  async function submit(
    decisions: DecisionPayload[],
    pendingKeys: string[],
    successMsg: string,
  ) {
    setPending((prev) => {
      const next = new Set(prev);
      pendingKeys.forEach((k) => next.add(k));
      return next;
    });
    try {
      await apiPost("/api/approve", { projectId: project.id, decisions });
      toast.success(successMsg);
      await Promise.all([refresh(), loadMedia()]);
    } catch (err) {
      // roll back optimistic state for the affected segments
      setOptimistic((prev) => {
        const next = { ...prev };
        for (const d of decisions) {
          if (d.segmentId) delete next[d.segmentId];
        }
        return next;
      });
      if (err instanceof ApiError && err.status === 503) {
        toast.error("A required provider isn't configured", {
          description: err.message,
        });
      } else {
        toast.error("Couldn't save decision", {
          description: err instanceof Error ? err.message : "Please try again.",
        });
      }
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        pendingKeys.forEach((k) => next.delete(k));
        return next;
      });
    }
  }

  function approve(segmentId: string, asset: MediaAsset) {
    setOptimistic((prev) => ({ ...prev, [segmentId]: asset.id }));
    void submit(
      [{ segmentId, assetId: asset.id, decision: "APPROVED" }],
      [`approve:${asset.id}`, `seg:${segmentId}`],
      "Option approved",
    );
  }

  function reject(segmentId: string, asset: MediaAsset) {
    // if rejecting the currently-approved one, clear optimistic
    setOptimistic((prev) => {
      if (prev[segmentId] === asset.id) {
        const next = { ...prev };
        delete next[segmentId];
        return next;
      }
      return prev;
    });
    void submit(
      [{ segmentId, assetId: asset.id, decision: "REJECTED" }],
      [`reject:${asset.id}`],
      "Option rejected",
    );
  }

  function regenerate(segmentId: string) {
    void submit(
      [{ segmentId, decision: "REGENERATE" }],
      [`seg:${segmentId}`],
      "Regeneration queued",
    );
  }

  function saveEditedPrompt() {
    if (!editing) return;
    const { segmentId, assetId, prompt } = editing;
    setEditing(null);
    void submit(
      [{ segmentId, assetId, decision: "EDIT_PROMPT", editedPrompt: prompt }],
      [`seg:${segmentId}`],
      "Prompt updated — regenerating",
    );
  }

  if (media === null) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} className="space-y-4 p-5">
            <Skeleton className="h-4 w-1/2" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <Skeleton key={j} className="aspect-video w-full rounded-lg" />
              ))}
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (totalSegments === 0) {
    return (
      <div className="space-y-4">
        {mediaError && <StorageHint />}
        <EmptyState
          icon={ImageIcon}
          title="No assets yet"
          hint="Generation runs after analysis. Once visuals are generated, you'll approve one option per segment here."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <TabHeading
        title="Visuals & approval"
        description="Pick the best AI visual for each segment."
        actions={
          <Badge
            variant="outline"
            className={cn(
              "gap-1.5 px-3 py-1",
              allApproved
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-border/60",
            )}
          >
            {allApproved ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {approvedCount}/{totalSegments} segments approved
          </Badge>
        }
      />

      {storageUnconfigured && <StorageHint />}

      {/* All approved banner */}
      {allApproved && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <Card className="flex items-center gap-3 border-emerald-500/30 bg-emerald-500/10 p-4">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-300" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-emerald-200">
                Every segment is approved
              </p>
              <p className="text-sm text-emerald-200/80">
                The timeline will build automatically — check the Timeline tab,
                then head to Render &amp; Export.
              </p>
            </div>
          </Card>
        </motion.div>
      )}

      <div className="space-y-5">
        {segmentIdsWithAssets.map((segmentId, idx) => {
          const seg = segmentById.get(segmentId);
          const options = assetsBySegment.get(segmentId) ?? [];
          const approvedId = optimistic[segmentId] ?? approvedBySegment.get(segmentId);
          const segPending = pending.has(`seg:${segmentId}`);
          return (
            <motion.div
              key={segmentId}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(idx * 0.04, 0.3) }}
            >
              <Card
                className={cn(
                  "overflow-hidden transition-colors",
                  approvedId && "border-emerald-500/30",
                )}
              >
                {/* Segment header */}
                <div className="flex items-start gap-3 border-b border-border/50 bg-muted/20 p-4">
                  <span className="mt-0.5 flex h-7 shrink-0 items-center rounded-md bg-primary/10 px-2 font-mono text-xs font-medium tabular-nums text-primary">
                    {seg ? formatTimecode(seg.startSec) : `#${idx + 1}`}
                  </span>
                  <p className="flex-1 text-sm leading-relaxed text-foreground">
                    {seg?.text ?? (
                      <span className="text-muted-foreground">
                        Segment {segmentId.slice(-6)}
                      </span>
                    )}
                  </p>
                  <div className="flex shrink-0 items-center gap-2">
                    {approvedId && (
                      <Badge
                        variant="outline"
                        className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      >
                        <Check className="h-3 w-3" />
                        Approved
                      </Badge>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={segPending}
                      onClick={() => regenerate(segmentId)}
                    >
                      {segPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      <span className="hidden sm:inline">Regenerate</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={segPending}
                      onClick={() =>
                        setEditing({
                          segmentId,
                          assetId: approvedId ?? options[0]?.id,
                          prompt: options[0]?.prompt ?? "",
                        })
                      }
                    >
                      <Pencil className="h-4 w-4" />
                      <span className="hidden sm:inline">Edit prompt</span>
                    </Button>
                  </div>
                </div>

                {/* Options grid */}
                <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
                  {options.map((asset) => (
                    <OptionCard
                      key={asset.id}
                      asset={asset}
                      approved={approvedId === asset.id}
                      approving={pending.has(`approve:${asset.id}`)}
                      rejecting={pending.has(`reject:${asset.id}`)}
                      onApprove={() => approve(segmentId, asset)}
                      onReject={() => reject(segmentId, asset)}
                      onEnlarge={() =>
                        setEnlarged({
                          segment: seg,
                          assets: options,
                          focusId: asset.id,
                        })
                      }
                    />
                  ))}
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Edit prompt dialog */}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-primary" />
              Edit visual prompt
            </DialogTitle>
            <DialogDescription>
              Refine the prompt and we&apos;ll regenerate options for this
              segment.
            </DialogDescription>
          </DialogHeader>
          <textarea
            autoFocus
            value={editing?.prompt ?? ""}
            onChange={(e) =>
              setEditing((prev) =>
                prev ? { ...prev, prompt: e.target.value } : prev,
              )
            }
            rows={5}
            placeholder="e.g. cinematic wide shot of a bustling city at golden hour, shallow depth of field"
            className="w-full resize-none rounded-md border border-input bg-background/40 px-3 py-2 text-sm shadow-sm backdrop-blur-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              variant="gradient"
              disabled={!editing?.prompt.trim()}
              onClick={saveEditedPrompt}
            >
              <Wand2 className="h-4 w-4" />
              Regenerate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enlarge / compare dialog */}
      <Dialog
        open={enlarged !== null}
        onOpenChange={(o) => !o && setEnlarged(null)}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Compare options</DialogTitle>
            {enlarged?.segment && (
              <DialogDescription className="line-clamp-2">
                {enlarged.segment.text}
              </DialogDescription>
            )}
          </DialogHeader>
          <CompareView enlarged={enlarged} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OptionCard({
  asset,
  approved,
  approving,
  rejecting,
  onApprove,
  onReject,
  onEnlarge,
}: {
  asset: MediaAsset;
  approved: boolean;
  approving: boolean;
  rejecting: boolean;
  onApprove: () => void;
  onReject: () => void;
  onEnlarge: () => void;
}) {
  const isVideo = asset.kind === "VIDEO" || asset.kind === "ANIMATION";

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg border bg-muted/20 transition-all",
        approved
          ? "border-emerald-500/50 ring-2 ring-emerald-500/30"
          : "border-border/60 hover:border-primary/50",
      )}
    >
      {/* Media */}
      <div className="relative aspect-video w-full overflow-hidden bg-black/40">
        {asset.thumbnailUrl || asset.url ? (
          isVideo && asset.url ? (
            <video
              src={asset.url}
              poster={asset.thumbnailUrl ?? undefined}
              muted
              loop
              playsInline
              preload="metadata"
              className="h-full w-full object-cover"
              onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})}
              onMouseLeave={(e) => {
                e.currentTarget.pause();
                e.currentTarget.currentTime = 0;
              }}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={(asset.thumbnailUrl ?? asset.url) as string}
              alt={asset.prompt}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          )
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageIcon className="h-6 w-6 text-muted-foreground" />
          </div>
        )}

        {/* Enlarge button */}
        <button
          type="button"
          onClick={onEnlarge}
          aria-label="Enlarge"
          className="absolute right-1.5 top-1.5 rounded-md bg-black/50 p-1.5 text-white/90 opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/70 focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>

        {/* Approved check */}
        {approved && (
          <div className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white shadow">
            <Check className="h-3.5 w-3.5" />
          </div>
        )}

        {/* Option index */}
        <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur-sm">
          Option {asset.optionIndex + 1}
        </span>
      </div>

      {/* Meta + actions */}
      <div className="space-y-2 p-2.5">
        <div className="flex flex-wrap items-center gap-1">
          {asset.provider && (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
              {asset.provider}
            </Badge>
          )}
          {asset.style && (
            <Badge
              variant="outline"
              className="px-1.5 py-0 text-[10px] capitalize"
            >
              {asset.style.replace(/_/g, " ").toLowerCase()}
            </Badge>
          )}
          <span className="ml-auto text-[10px] font-medium tabular-nums text-muted-foreground">
            {formatConfidence(asset.confidence)}
          </span>
        </div>

        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant={approved ? "outline" : "gradient"}
            className="h-7 flex-1 px-2 text-xs"
            disabled={approving || approved}
            onClick={onApprove}
          >
            {approving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : approved ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            {approved ? "Approved" : "Approve"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            disabled={rejecting}
            onClick={onReject}
            aria-label="Reject option"
          >
            {rejecting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <X className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CompareView({
  enlarged,
}: {
  enlarged: {
    segment: TranscriptSegment | undefined;
    assets: MediaAsset[];
    focusId: string;
  } | null;
}) {
  const [focusId, setFocusId] = React.useState(enlarged?.focusId ?? "");
  React.useEffect(() => {
    if (enlarged) setFocusId(enlarged.focusId);
  }, [enlarged]);

  if (!enlarged) return null;
  const focus =
    enlarged.assets.find((a) => a.id === focusId) ?? enlarged.assets[0];
  const isVideo = focus?.kind === "VIDEO" || focus?.kind === "ANIMATION";

  return (
    <div className="space-y-3">
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
        {focus?.url || focus?.thumbnailUrl ? (
          isVideo && focus.url ? (
            <video
              src={focus.url}
              poster={focus.thumbnailUrl ?? undefined}
              controls
              autoPlay
              loop
              className="h-full w-full object-contain"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={(focus.thumbnailUrl ?? focus.url) as string}
              alt={focus.prompt}
              className="h-full w-full object-contain"
            />
          )
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
            Preview unavailable (storage not configured)
          </div>
        )}
      </div>

      {focus?.prompt && (
        <p className="rounded-md bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
          {focus.prompt}
        </p>
      )}

      {enlarged.assets.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {enlarged.assets.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setFocusId(a.id)}
              className={cn(
                "relative aspect-video h-16 shrink-0 overflow-hidden rounded-md border-2 bg-muted/20 transition-colors",
                a.id === focus?.id
                  ? "border-primary"
                  : "border-transparent hover:border-border",
              )}
            >
              {a.thumbnailUrl || a.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={(a.thumbnailUrl ?? a.url) as string}
                  alt={`Option ${a.optionIndex + 1}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
