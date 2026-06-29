"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Captions, Check, Globe, Loader2, Sparkles, Type } from "lucide-react";

import { cn } from "@/lib/utils";
import { apiPost, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CAPTION_STYLES,
  formatTimecode,
  LANGUAGE_LABELS,
  type CaptionStyle,
  type LanguageCode,
  type SubtitleInfo,
  type TabProps,
} from "@/components/editor/types";
import { EmptyState, TabHeading } from "@/components/editor/shared";

const ALL_LANGUAGES = Object.keys(LANGUAGE_LABELS) as LanguageCode[];

export function CaptionsTab({ project, refresh }: TabProps) {
  const subtitles = project.subtitles ?? [];

  // Default the style picker to whatever the first existing subtitle uses.
  const [style, setStyle] = React.useState<CaptionStyle>(
    subtitles[0]?.style ?? "KARAOKE",
  );
  const [languages, setLanguages] = React.useState<Set<LanguageCode>>(
    () => new Set<LanguageCode>(["EN"]),
  );
  const [mode, setMode] = React.useState<"ENGLISH" | "ORIGINAL" | "DUAL">("ENGLISH");
  const [generating, setGenerating] = React.useState(false);

  const MODES: { value: "ENGLISH" | "ORIGINAL" | "DUAL"; label: string; hint: string }[] = [
    { value: "ENGLISH", label: "English", hint: "Original audio · English subtitles (default)" },
    { value: "ORIGINAL", label: "Original", hint: "Captions in the spoken language" },
    { value: "DUAL", label: "Dual", hint: "English + original, stacked" },
  ];

  const subtitlesByLanguage = React.useMemo(() => {
    const map = new Map<LanguageCode, SubtitleInfo[]>();
    for (const s of subtitles) {
      const arr = map.get(s.language) ?? [];
      arr.push(s);
      map.set(s.language, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.startSec - b.startSec);
    return map;
  }, [subtitles]);

  function toggleLanguage(lang: LanguageCode) {
    setLanguages((prev) => {
      const next = new Set(prev);
      if (next.has(lang)) next.delete(lang);
      else next.add(lang);
      // never allow an empty selection
      if (next.size === 0) next.add("EN");
      return next;
    });
  }

  async function generate() {
    setGenerating(true);
    try {
      await apiPost("/api/subtitles", {
        projectId: project.id,
        mode,
        style,
        languages: [...languages],
      });
      toast.success("Captions queued", {
        description: `${MODES.find((m) => m.value === mode)?.label} captions · ${style.replace(/_/g, " ").toLowerCase()} style.`,
      });
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        toast.error("A required provider isn't configured", {
          description: err.message,
        });
      } else {
        toast.error("Couldn't generate captions", {
          description: err instanceof Error ? err.message : "Please try again.",
        });
      }
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <TabHeading
        title="Captions"
        description="Original audio is always preserved. By default captions are translated to English; switch the mode for original or dual subtitles."
      />

      {/* Subtitle language mode */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Globe className="h-4 w-4 text-primary" />
          Subtitle language
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {MODES.map((m) => {
            const active = mode === m.value;
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => setMode(m.value)}
                aria-pressed={active}
                className={cn(
                  "relative flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "border-primary/60 bg-primary/10"
                    : "border-border/60 bg-muted/20 hover:border-primary/40",
                )}
              >
                {active && (
                  <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-2.5 w-2.5" />
                  </span>
                )}
                <span className="text-sm font-semibold">{m.label}</span>
                <span className="text-[11px] text-muted-foreground">{m.hint}</span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Style picker */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Type className="h-4 w-4 text-primary" />
          Caption style
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {CAPTION_STYLES.map((s) => {
            const active = style === s.value;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => setStyle(s.value)}
                aria-pressed={active}
                className={cn(
                  "relative flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "border-primary/60 bg-primary/10"
                    : "border-border/60 bg-muted/20 hover:border-primary/40",
                )}
              >
                {active && (
                  <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-2.5 w-2.5" />
                  </span>
                )}
                <span className="text-sm font-semibold">{s.label}</span>
                <span className="text-[11px] text-muted-foreground">
                  {s.hint}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Note: the style is applied when captions are generated by the pipeline.
        </p>
      </Card>

      {/* Languages */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Globe className="h-4 w-4 text-primary" />
          Languages
        </div>
        <div className="flex flex-wrap gap-2">
          {ALL_LANGUAGES.map((lang) => {
            const active = languages.has(lang);
            return (
              <button
                key={lang}
                type="button"
                onClick={() => toggleLanguage(lang)}
                aria-pressed={active}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "border-primary/60 bg-primary/15 text-primary"
                    : "border-border/60 bg-muted/20 text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
              >
                {active && <Check className="h-3 w-3" />}
                {LANGUAGE_LABELS[lang]}
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-border/50 pt-4">
          <p className="text-xs text-muted-foreground">
            {languages.size} {languages.size === 1 ? "language" : "languages"}{" "}
            selected
          </p>
          <Button
            variant="gradient"
            onClick={generate}
            disabled={generating}
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Generate captions
          </Button>
        </div>
      </Card>

      {/* Existing subtitles */}
      <div>
        <TabHeading
          title="Generated captions"
          description={
            subtitles.length > 0
              ? `${subtitles.length} cues across ${subtitlesByLanguage.size} ${subtitlesByLanguage.size === 1 ? "language" : "languages"}`
              : undefined
          }
        />
        <div className="mt-4">
          {subtitles.length === 0 ? (
            <EmptyState
              icon={Captions}
              title="No captions yet"
              hint="Generate captions above and they'll appear here grouped by language."
            />
          ) : (
            <div className="space-y-5">
              {[...subtitlesByLanguage.entries()].map(([lang, cues]) => (
                <Card key={lang} className="overflow-hidden">
                  <div className="flex items-center justify-between border-b border-border/50 bg-muted/20 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold">
                        {LANGUAGE_LABELS[lang] ?? lang}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {cues.length} cues
                      </Badge>
                    </div>
                    {cues[0]?.style && (
                      <Badge variant="outline" className="gap-1 text-[10px] capitalize">
                        {cues[0].style.replace(/_/g, " ").toLowerCase()}
                      </Badge>
                    )}
                  </div>
                  <ul className="max-h-96 divide-y divide-border/40 overflow-y-auto">
                    {cues.map((cue, i) => (
                      <motion.li
                        key={cue.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: Math.min(i * 0.015, 0.2) }}
                        className="flex gap-3 px-4 py-2.5"
                      >
                        <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                          {formatTimecode(cue.startSec)}
                        </span>
                        <span className="text-sm text-foreground">
                          {cue.text}
                        </span>
                      </motion.li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
