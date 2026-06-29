"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  AtSign,
  Check,
  Globe,
  ImageIcon,
  Loader2,
  Palette,
  Save,
  Stamp,
  Type,
  UploadCloud,
  User,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { apiPost, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BrandColors, TabProps } from "@/components/editor/types";
import { TabHeading } from "@/components/editor/shared";

type ColorKey = keyof Pick<BrandColors, "primary" | "secondary" | "accent">;

const COLOR_FIELDS: { key: ColorKey; label: string; fallback: string }[] = [
  { key: "primary", label: "Primary", fallback: "#7c3aed" },
  { key: "secondary", label: "Secondary", fallback: "#6366f1" },
  { key: "accent", label: "Accent", fallback: "#22d3ee" },
];

interface UploadState {
  uploading: boolean;
  filename?: string;
}

/** PUT a file to a presigned URL. */
function putFile(url: string, file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader(
      "content-type",
      file.type || "application/octet-stream",
    );
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });
}

export function BrandingTab({ project, refresh }: TabProps) {
  const branding = project.branding;
  const initialColors = (branding?.brandColors ?? {}) as BrandColors;

  const [username, setUsername] = React.useState(branding?.username ?? "");
  const [website, setWebsite] = React.useState(branding?.website ?? "");
  const [socialHandle, setSocialHandle] = React.useState(
    branding?.socialHandle ?? "",
  );
  const [fontFamily, setFontFamily] = React.useState(
    branding?.fontFamily ?? "",
  );
  const [colors, setColors] = React.useState<BrandColors>(initialColors);
  const [logoKey, setLogoKey] = React.useState<string | null>(
    branding?.logoS3Key ?? null,
  );
  const [watermarkKey, setWatermarkKey] = React.useState<string | null>(
    branding?.watermarkS3Key ?? null,
  );

  const [saving, setSaving] = React.useState(false);
  const [logoUpload, setLogoUpload] = React.useState<UploadState>({
    uploading: false,
  });
  const [watermarkUpload, setWatermarkUpload] = React.useState<UploadState>({
    uploading: false,
  });

  function setColor(key: ColorKey, value: string) {
    setColors((prev) => ({ ...prev, [key]: value }));
  }

  async function uploadAsset(
    kind: "logo" | "watermark",
    file: File,
    setState: React.Dispatch<React.SetStateAction<UploadState>>,
    setKey: (k: string) => void,
  ) {
    setState({ uploading: true, filename: file.name });
    try {
      const { key, uploadUrl } = await apiPost<{
        key: string;
        uploadUrl: string;
      }>("/api/branding/upload", {
        projectId: project.id,
        kind,
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
      });
      await putFile(uploadUrl, file);
      setKey(key);
      toast.success(`${kind === "logo" ? "Logo" : "Watermark"} uploaded`, {
        description: "Remember to Save to apply it.",
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        toast.error("Storage isn't configured", {
          description: "Add your AWS S3 keys in Settings to enable uploads.",
          action: {
            label: "Settings",
            onClick: () => {
              window.location.href = "/settings";
            },
          },
        });
      } else {
        toast.error("Upload failed", {
          description: err instanceof Error ? err.message : "Please try again.",
        });
      }
    } finally {
      setState({ uploading: false });
    }
  }

  async function save() {
    setSaving(true);
    try {
      const brandColors: BrandColors = {};
      for (const f of COLOR_FIELDS) {
        const v = colors[f.key];
        if (v) brandColors[f.key] = v;
      }
      await apiPost("/api/branding", {
        projectId: project.id,
        username: username || undefined,
        website: website || undefined,
        socialHandle: socialHandle || undefined,
        fontFamily: fontFamily || undefined,
        brandColors:
          Object.keys(brandColors).length > 0 ? brandColors : undefined,
        logoS3Key: logoKey || undefined,
        watermarkS3Key: watermarkKey || undefined,
      });
      toast.success("Branding saved");
      await refresh();
    } catch (err) {
      toast.error("Couldn't save branding", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <TabHeading
        title="Branding"
        description="Personalize the exported video with your identity."
        actions={
          <Button variant="gradient" onClick={save} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save branding
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Identity */}
        <Card className="space-y-5 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <User className="h-4 w-4 text-primary" />
            Identity
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brand-username">Display name</Label>
            <Input
              id="brand-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Jane Creator"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brand-handle" className="flex items-center gap-1.5">
              <AtSign className="h-3.5 w-3.5 text-muted-foreground" />
              Social handle
            </Label>
            <Input
              id="brand-handle"
              value={socialHandle}
              onChange={(e) => setSocialHandle(e.target.value)}
              placeholder="@janecreator"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brand-website" className="flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              Website
            </Label>
            <Input
              id="brand-website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="janecreator.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brand-font" className="flex items-center gap-1.5">
              <Type className="h-3.5 w-3.5 text-muted-foreground" />
              Font family
            </Label>
            <Input
              id="brand-font"
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              placeholder="Inter, Montserrat, …"
            />
          </div>
        </Card>

        {/* Colors */}
        <Card className="space-y-5 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Palette className="h-4 w-4 text-primary" />
            Brand colors
          </div>
          <div className="space-y-4">
            {COLOR_FIELDS.map((f) => {
              const value = colors[f.key] || "";
              const swatch = value || f.fallback;
              return (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={`color-${f.key}`}>{f.label}</Label>
                  <div className="flex items-center gap-2">
                    <label
                      className="relative h-10 w-12 shrink-0 cursor-pointer overflow-hidden rounded-md border border-input"
                      style={{ background: swatch }}
                    >
                      <input
                        type="color"
                        value={/^#[0-9a-fA-F]{6}$/.test(swatch) ? swatch : f.fallback}
                        onChange={(e) => setColor(f.key, e.target.value)}
                        className="absolute inset-0 cursor-pointer opacity-0"
                        aria-label={`${f.label} color picker`}
                      />
                    </label>
                    <Input
                      id={`color-${f.key}`}
                      value={value}
                      onChange={(e) => setColor(f.key, e.target.value)}
                      placeholder={f.fallback}
                      className="font-mono"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Uploads */}
      <div className="grid gap-6 sm:grid-cols-2">
        <UploadField
          icon={ImageIcon}
          title="Logo"
          hint="PNG with transparency works best."
          currentKey={logoKey}
          state={logoUpload}
          onPick={(file) =>
            uploadAsset("logo", file, setLogoUpload, setLogoKey)
          }
        />
        <UploadField
          icon={Stamp}
          title="Watermark"
          hint="Shown subtly over the whole video."
          currentKey={watermarkKey}
          state={watermarkUpload}
          onPick={(file) =>
            uploadAsset("watermark", file, setWatermarkUpload, setWatermarkKey)
          }
        />
      </div>
    </div>
  );
}

function UploadField({
  icon: Icon,
  title,
  hint,
  currentKey,
  state,
  onPick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint: string;
  currentKey: string | null;
  state: UploadState;
  onPick: (file: File) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const filename = currentKey?.split("/").pop();

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4 text-primary" />
        {title}
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={state.uploading}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
          "border-border/70 bg-muted/20 hover:border-primary/60 hover:bg-muted/40",
          state.uploading && "pointer-events-none opacity-70",
        )}
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/15">
          {state.uploading ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : currentKey ? (
            <Check className="h-5 w-5 text-emerald-400" />
          ) : (
            <UploadCloud className="h-5 w-5 text-primary" />
          )}
        </span>
        <span className="text-sm font-medium text-foreground">
          {state.uploading
            ? `Uploading ${state.filename ?? ""}…`
            : currentKey
              ? "Replace file"
              : "Click to upload"}
        </span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </button>
      {currentKey && !state.uploading && (
        <p className="mt-3 truncate text-xs text-muted-foreground" title={filename}>
          Current: <span className="text-foreground">{filename}</span>
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
    </Card>
  );
}
