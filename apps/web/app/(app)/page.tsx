"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Plus,
  Sparkles,
  Film,
  RefreshCw,
  Wand2,
  AlertCircle,
} from "lucide-react";

import { apiGet } from "@/lib/api-client";
import type { ProjectsResponse, ProjectSummary } from "@/lib/projects";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectCard } from "@/components/project-card";
import { UploadDialog } from "@/components/upload-dialog";

export default function DashboardPage() {
  const [projects, setProjects] = React.useState<ProjectSummary[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setError(null);
      const data = await apiGet<ProjectsResponse>("/api/projects");
      setProjects(data.projects ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
      setProjects([]);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  // refresh the list whenever the upload dialog closes (covers router.refresh)
  React.useEffect(() => {
    if (!uploadOpen) void load();
  }, [uploadOpen, load]);

  const loading = projects === null;
  const isEmpty = !loading && projects.length === 0 && !error;

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-10 sm:px-6 lg:px-8">
      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/40 p-8 backdrop-blur-xl sm:p-12"
      >
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-indigo-500/15 blur-3xl" />

        <div className="relative max-w-2xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            AI-powered video studio
          </span>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
            <span className="bg-gradient-to-r from-white via-white to-white/60 bg-clip-text text-transparent">
              Turn talking heads into
            </span>{" "}
            <span className="bg-gradient-to-r from-violet-400 via-primary to-indigo-400 bg-clip-text text-transparent">
              scroll-stopping shorts
            </span>
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
            Upload a video and AUTO VISUAL AI transcribes it, generates synced
            visuals, captions every word, and exports a cinema-quality 9:16 cut.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              variant="gradient"
              onClick={() => setUploadOpen(true)}
            >
              <Plus className="h-4 w-4" />
              New Project
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => void load()}
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>
      </motion.section>

      {/* Projects */}
      <div className="mt-12">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              Your projects
            </h2>
            <p className="text-sm text-muted-foreground">
              {loading
                ? "Loading…"
                : `${projects.length} ${projects.length === 1 ? "project" : "projects"}`}
            </p>
          </div>
        </div>

        {error && (
          <Card className="mb-6 flex items-center gap-3 border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="flex-1">{error}</span>
            <Button size="sm" variant="outline" onClick={() => void load()}>
              Retry
            </Button>
          </Card>
        )}

        {loading ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="space-y-4 p-5">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-11 w-11 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
                <Skeleton className="h-8 w-full" />
              </Card>
            ))}
          </div>
        ) : isEmpty ? (
          <EmptyState onNew={() => setUploadOpen(true)} />
        ) : (
          <motion.div
            layout
            className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
          >
            {projects.map((p, i) => (
              <ProjectCard key={p.id} project={p} index={i} />
            ))}
          </motion.div>
        )}
      </div>

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="flex flex-col items-center justify-center gap-5 px-6 py-20 text-center">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-primary/30 blur-2xl" />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-500/10 ring-1 ring-inset ring-border/60">
            <Film className="h-9 w-9 text-primary" />
          </div>
        </div>
        <div className="max-w-sm space-y-2">
          <h3 className="text-lg font-semibold">No projects yet</h3>
          <p className="text-sm text-muted-foreground">
            Upload your first talking-head video and watch AUTO VISUAL AI turn it
            into a polished short.
          </p>
        </div>
        <Button variant="gradient" size="lg" onClick={onNew}>
          <Wand2 className="h-4 w-4" />
          Create your first project
        </Button>
      </Card>
    </motion.div>
  );
}
