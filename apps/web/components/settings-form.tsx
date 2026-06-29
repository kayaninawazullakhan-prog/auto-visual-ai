"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  KeyRound,
  Loader2,
  Save,
  ShieldCheck,
  Sliders,
  Eye,
  EyeOff,
  AlertCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { apiGet, apiPost } from "@/lib/api-client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SettingField {
  key: string;
  label: string;
  secret: boolean;
  placeholder?: string;
  kind?: "text" | "select";
  options?: string[];
}
interface SettingGroup {
  id: string;
  title: string;
  description: string;
  fields: SettingField[];
}
type Status = Record<string, { set: boolean; value?: string }>;
interface SettingsResponse {
  groups: SettingGroup[];
  status: Status;
}

export function SettingsForm() {
  const [groups, setGroups] = React.useState<SettingGroup[] | null>(null);
  const [status, setStatus] = React.useState<Status>({});
  const [error, setError] = React.useState<string | null>(null);
  // edits holds only fields the user has touched (key -> new value)
  const [edits, setEdits] = React.useState<Record<string, string>>({});
  const [reveal, setReveal] = React.useState<Record<string, boolean>>({});
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setError(null);
      const data = await apiGet<SettingsResponse>("/api/settings");
      setGroups(data.groups);
      setStatus(data.status ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
      setGroups([]);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const dirtyCount = Object.keys(edits).length;

  function setField(key: string, value: string) {
    setEdits((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    if (dirtyCount === 0) return;
    setSaving(true);
    try {
      const res = await apiPost<{ ok: true; status: Status }>(
        "/api/settings",
        { values: edits },
      );
      setStatus(res.status ?? {});
      setEdits({});
      setReveal({});
      toast.success("Settings saved", {
        description: `Updated ${dirtyCount} ${dirtyCount === 1 ? "field" : "fields"}.`,
      });
    } catch (err) {
      toast.error("Couldn't save settings", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  if (groups === null) {
    return (
      <div className="grid gap-6 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-6">
            <Skeleton className="mb-2 h-5 w-40" />
            <Skeleton className="mb-6 h-3 w-56" />
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <>
      {error && (
        <Card className="mb-6 flex items-center gap-3 border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {groups.map((group, gi) => (
          <motion.div
            key={group.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: Math.min(gi * 0.06, 0.4) }}
          >
            <Card className="h-full transition-colors hover:border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
                    <Sliders className="h-4 w-4 text-primary" />
                  </span>
                  {group.title}
                </CardTitle>
                <CardDescription>{group.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {group.fields.map((field) => (
                  <FieldRow
                    key={field.key}
                    field={field}
                    status={status[field.key]}
                    value={edits[field.key]}
                    dirty={field.key in edits}
                    revealed={!!reveal[field.key]}
                    onToggleReveal={() =>
                      setReveal((p) => ({ ...p, [field.key]: !p[field.key] }))
                    }
                    onChange={(v) => setField(field.key, v)}
                  />
                ))}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Sticky save bar */}
      <div className="pointer-events-none sticky bottom-6 z-30 mt-8 flex justify-center">
        <motion.div
          initial={false}
          animate={{
            opacity: dirtyCount > 0 ? 1 : 0.85,
            y: dirtyCount > 0 ? 0 : 8,
          }}
          className="pointer-events-auto flex items-center gap-4 rounded-full border border-border/60 bg-card/80 px-3 py-2 pl-5 shadow-2xl shadow-black/40 backdrop-blur-2xl"
        >
          <span className="text-sm text-muted-foreground">
            {dirtyCount > 0
              ? `${dirtyCount} unsaved ${dirtyCount === 1 ? "change" : "changes"}`
              : "All changes saved"}
          </span>
          <Button
            variant="gradient"
            size="sm"
            disabled={dirtyCount === 0 || saving}
            onClick={save}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save changes
          </Button>
        </motion.div>
      </div>
    </>
  );
}

function FieldRow({
  field,
  status,
  value,
  dirty,
  revealed,
  onToggleReveal,
  onChange,
}: {
  field: SettingField;
  status?: { set: boolean; value?: string };
  value: string | undefined;
  dirty: boolean;
  revealed: boolean;
  onToggleReveal: () => void;
  onChange: (v: string) => void;
}) {
  const configured = !!status?.set;

  if (field.kind === "select" && field.options) {
    // current = edited value, else stored value, else first option
    const current = value ?? status?.value ?? "";
    return (
      <div className="space-y-1.5">
        <Label htmlFor={field.key}>{field.label}</Label>
        <Select
          value={current || undefined}
          onValueChange={onChange}
        >
          <SelectTrigger id={field.key} className={cn(dirty && "border-primary/60")}>
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  // Secret field: password input + "Configured" badge + reveal toggle
  if (field.secret) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor={field.key} className="flex items-center gap-1.5">
            <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
            {field.label}
          </Label>
          {configured && (
            <Badge variant="success" className="gap-1">
              <ShieldCheck className="h-3 w-3" />
              Configured
            </Badge>
          )}
        </div>
        <div className="relative">
          <Input
            id={field.key}
            type={revealed ? "text" : "password"}
            autoComplete="off"
            value={value ?? ""}
            placeholder={
              configured ? "•••••••••••• (leave blank to keep)" : field.placeholder
            }
            onChange={(e) => onChange(e.target.value)}
            className={cn("pr-10", dirty && "border-primary/60")}
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={onToggleReveal}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
            aria-label={revealed ? "Hide value" : "Show value"}
          >
            {revealed ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    );
  }

  // Plain text field (non-secret): prefill with stored value
  const textValue = value ?? status?.value ?? "";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={field.key}>{field.label}</Label>
        {configured && !field.secret && (
          <Badge variant="success" className="gap-1">
            <ShieldCheck className="h-3 w-3" />
            Set
          </Badge>
        )}
      </div>
      <Input
        id={field.key}
        type="text"
        value={textValue}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(dirty && "border-primary/60")}
      />
    </div>
  );
}

export default SettingsForm;
