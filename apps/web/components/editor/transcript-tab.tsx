"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { FileText, Hash, Languages, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  formatConfidence,
  formatTimecode,
  KEYWORD_KIND_STYLES,
  LANGUAGE_LABELS,
  type KeywordInfo,
  type TabProps,
  type TopicInfo,
} from "@/components/editor/types";
import { EmptyState, TabHeading } from "@/components/editor/shared";

export function TranscriptTab({ project }: TabProps) {
  const transcript = project.transcript;
  const segments = transcript?.segments ?? [];
  const keywords = project.keywords ?? [];
  const topics = project.topics ?? [];

  // Group keywords + topics by segment for O(1) lookup.
  const keywordsBySegment = React.useMemo(() => {
    const map = new Map<string, KeywordInfo[]>();
    for (const k of keywords) {
      if (!k.segmentId) continue;
      const arr = map.get(k.segmentId) ?? [];
      arr.push(k);
      map.set(k.segmentId, arr);
    }
    return map;
  }, [keywords]);

  const topicsBySegment = React.useMemo(() => {
    const map = new Map<string, TopicInfo[]>();
    for (const t of topics) {
      if (!t.segmentId) continue;
      const arr = map.get(t.segmentId) ?? [];
      arr.push(t);
      map.set(t.segmentId, arr);
    }
    return map;
  }, [topics]);

  if (segments.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No transcript yet"
        hint="Transcription runs automatically after upload. Once it finishes, every segment will appear here with timecodes."
      />
    );
  }

  return (
    <div className="space-y-6">
      <TabHeading
        title="Transcript"
        description={`${segments.length} ${segments.length === 1 ? "segment" : "segments"} · word-level timing`}
        actions={
          <div className="flex items-center gap-2">
            {transcript?.language && (
              <Badge variant="outline" className="gap-1">
                <Languages className="h-3 w-3" />
                {LANGUAGE_LABELS[transcript.language] ?? transcript.language}
              </Badge>
            )}
          </div>
        }
      />

      <div className="space-y-3">
        {segments.map((seg, i) => {
          const segTopic =
            seg.topic ||
            topicsBySegment.get(seg.id)?.[0]?.name ||
            null;
          const segKeywords = keywordsBySegment.get(seg.id) ?? [];
          return (
            <motion.div
              key={seg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.25) }}
            >
              <Card className="group p-4 transition-colors hover:border-primary/40">
                <div className="flex gap-4">
                  {/* Timecode rail */}
                  <div className="flex shrink-0 flex-col items-center">
                    <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs font-medium tabular-nums text-primary">
                      {formatTimecode(seg.startSec)}
                    </span>
                    <span className="my-1 w-px flex-1 bg-border/60" />
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                      {formatTimecode(seg.endSec)}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-relaxed text-foreground">
                      {seg.text}
                    </p>

                    {(segTopic || segKeywords.length > 0 || seg.intent) && (
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        {segTopic && (
                          <Badge
                            variant="outline"
                            className="gap-1 border-primary/30 bg-primary/10 text-primary"
                          >
                            <Sparkles className="h-3 w-3" />
                            {segTopic}
                          </Badge>
                        )}
                        {seg.intent && (
                          <Badge
                            variant="outline"
                            className="border-border/60 text-muted-foreground"
                          >
                            {seg.intent}
                          </Badge>
                        )}
                        {segKeywords.map((kw) => (
                          <span
                            key={kw.id}
                            title={`${kw.kind.toLowerCase()} · ${formatConfidence(kw.confidence)}`}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                              KEYWORD_KIND_STYLES[kw.kind] ??
                                KEYWORD_KIND_STYLES.KEYWORD,
                            )}
                          >
                            <Hash className="h-2.5 w-2.5 opacity-70" />
                            {kw.text}
                          </span>
                        ))}
                      </div>
                    )}

                    {seg.context && (
                      <p className="mt-2 text-xs italic text-muted-foreground">
                        {seg.context}
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
