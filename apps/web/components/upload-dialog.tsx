"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  UploadCloud,
  FileVideo,
  Loader2,
  X,
  CheckCircle2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { apiPost, ApiError } from "@/lib/api-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

const ACCEPT = ".mp4,.mov,.avi,.mkv,video/mp4,video/quicktime,video/x-msvideo,video/x-matroska";
const ACCEPTED_EXT = ["mp4", "mov", "avi", "mkv"];

type Phase = "idle" | "creating" | "uploading" | "finalizing" | "done";

interface UploadResponse {
  projectId: string;
  videoId: string;
  uploadUrl: string;
  s3Key: string;
}

function prettySize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

function extOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

/** PUT a File to a presigned S3 URL via XHR so we get upload progress events. */
function putWithProgress(
  url: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });
}

export function UploadDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [progress, setProgress] = React.useState(0);

  const busy = phase !== "idle" && phase !== "done";

  const reset = React.useCallback(() => {
    setFile(null);
    setDragging(false);
    setPhase("idle");
    setProgress(0);
  }, []);

  function pick(f: File | undefined | null) {
    if (!f) return;
    if (!ACCEPTED_EXT.includes(extOf(f.name))) {
      toast.error("Unsupported file type", {
        description: `Allowed formats: ${ACCEPTED_EXT.join(", ").toUpperCase()}`,
      });
      return;
    }
    setFile(f);
  }

  async function start() {
    if (!file) return;
    try {
      setPhase("creating");
      setProgress(0);

      const res = await apiPost<UploadResponse>("/api/upload", {
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      });

      setPhase("uploading");
      await putWithProgress(res.uploadUrl, file, setProgress);

      setPhase("finalizing");
      await apiPost("/api/upload/complete", { videoId: res.videoId });

      setPhase("done");
      toast.success("Upload complete", {
        description: "We're processing your video now.",
      });

      // close, reset, and refresh the dashboard list
      setTimeout(() => {
        onOpenChange(false);
        reset();
        router.refresh();
      }, 700);
    } catch (err) {
      setPhase("idle");
      setProgress(0);
      if (err instanceof ApiError && err.status === 503) {
        toast.error("Storage not configured", {
          description: "Add your AWS S3 keys in Settings to enable uploads.",
          action: {
            label: "Open Settings",
            onClick: () => router.push("/settings"),
          },
        });
        return;
      }
      toast.error("Upload failed", {
        description:
          err instanceof Error ? err.message : "Something went wrong.",
      });
    }
  }

  const phaseLabel: Record<Phase, string> = {
    idle: "",
    creating: "Preparing upload…",
    uploading: `Uploading… ${progress}%`,
    finalizing: "Starting pipeline…",
    done: "Done!",
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return; // don't allow closing mid-upload
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500">
              <UploadCloud className="h-4 w-4 text-white" />
            </span>
            New project
          </DialogTitle>
          <DialogDescription>
            Upload a talking-head video. We&apos;ll transcribe it, generate
            visuals, and cut a polished short.
          </DialogDescription>
        </DialogHeader>

        {/* Dropzone / selected file */}
        <AnimatePresence mode="wait">
          {!file ? (
            <motion.button
              key="dropzone"
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                pick(e.dataTransfer.files?.[0]);
              }}
              className={cn(
                "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
                dragging
                  ? "border-primary bg-primary/10"
                  : "border-border/70 bg-muted/20 hover:border-primary/60 hover:bg-muted/40",
              )}
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/15">
                <UploadCloud className="h-7 w-7 text-primary" />
              </span>
              <span className="text-sm font-medium text-foreground">
                Drag &amp; drop or{" "}
                <span className="text-primary">browse</span>
              </span>
              <span className="text-xs text-muted-foreground">
                MP4, MOV, AVI or MKV
              </span>
            </motion.button>
          ) : (
            <motion.div
              key="file"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-xl border border-border/60 bg-muted/30 p-4"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/15">
                  {phase === "done" ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  ) : (
                    <FileVideo className="h-5 w-5 text-primary" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {file.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {prettySize(file.size)}
                  </p>
                </div>
                {!busy && phase !== "done" && (
                  <button
                    type="button"
                    onClick={reset}
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    aria-label="Remove file"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {(busy || phase === "done") && (
                <div className="mt-4 space-y-1.5">
                  <Progress
                    value={phase === "uploading" ? progress : phase === "done" ? 100 : undefined}
                    className={cn(
                      (phase === "creating" || phase === "finalizing") &&
                        "animate-pulse",
                    )}
                    indicatorClassName={
                      phase === "done"
                        ? "from-emerald-500 via-emerald-500 to-emerald-400"
                        : undefined
                    }
                  />
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                    {phaseLabel[phase]}
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <p className="mr-auto hidden text-xs text-muted-foreground sm:block">
            Need storage?{" "}
            <Link
              href="/settings"
              className="text-primary underline-offset-2 hover:underline"
            >
              Configure S3
            </Link>
          </p>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              onOpenChange(false);
              reset();
            }}
          >
            Cancel
          </Button>
          <Button
            variant="gradient"
            disabled={!file || busy || phase === "done"}
            onClick={start}
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Working…
              </>
            ) : (
              <>
                <UploadCloud className="h-4 w-4" />
                Upload &amp; process
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default UploadDialog;
