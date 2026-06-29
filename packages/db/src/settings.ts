import { setOverrides } from "@ava/config";
import { prisma } from "./index.js";

/** A single settable field shown on the Settings page. */
export interface SettingField {
  key: string;
  label: string;
  secret: boolean;
  placeholder?: string;
  kind?: "text" | "select";
  options?: string[];
}

export interface SettingGroup {
  id: string;
  title: string;
  description: string;
  fields: SettingField[];
}

/** UI groups + the whitelist of env keys manageable from the Settings page. */
export const SETTING_GROUPS: SettingGroup[] = [
  {
    id: "ai",
    title: "Language AI — Claude",
    description:
      "Your Anthropic (Claude) key powers understanding + translation (original language → English). Transcription runs LOCALLY with Whisper — no key needed.",
    fields: [
      { key: "ANTHROPIC_API_KEY", label: "Anthropic (Claude) API key", secret: true, placeholder: "sk-ant-..." },
      {
        key: "ANTHROPIC_MODEL",
        label: "Claude model",
        secret: false,
        kind: "select",
        options: ["claude-opus-4-8", "claude-opus-4-7", "claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5"],
      },
      {
        key: "WHISPER_PROVIDER",
        label: "Transcription engine",
        secret: false,
        kind: "select",
        options: ["local", "openai", "replicate"],
      },
    ],
  },
  {
    id: "image",
    title: "Image Generation",
    description: "Flux / SDXL (fal.ai or Replicate) or OpenAI Images. Independent from the language model.",
    fields: [
      { key: "IMAGE_PROVIDER", label: "Image provider", secret: false, kind: "select", options: ["flux", "sdxl", "openai"] },
      { key: "FAL_KEY", label: "fal.ai API key", secret: true, placeholder: "fal-..." },
      { key: "REPLICATE_API_TOKEN", label: "Replicate API token", secret: true, placeholder: "r8_..." },
      { key: "OPENAI_API_KEY", label: "OpenAI API key (OpenAI Images / OpenAI Whisper)", secret: true, placeholder: "sk-..." },
    ],
  },
  {
    id: "storage",
    title: "Storage (optional)",
    description: "Defaults to local disk — no AWS needed. Add S3 only for cloud / production.",
    fields: [
      { key: "AWS_ACCESS_KEY_ID", label: "AWS access key id", secret: true },
      { key: "AWS_SECRET_ACCESS_KEY", label: "AWS secret access key", secret: true },
      { key: "AWS_REGION", label: "AWS region", secret: false, placeholder: "us-east-1" },
      { key: "S3_BUCKET", label: "S3 bucket", secret: false },
      { key: "S3_PUBLIC_URL", label: "Public URL / CloudFront", secret: false },
    ],
  },
  {
    id: "auth-billing",
    title: "Auth & Billing",
    description: "Clerk authentication and Stripe payments.",
    fields: [
      { key: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", label: "Clerk publishable key", secret: false, placeholder: "pk_..." },
      { key: "CLERK_SECRET_KEY", label: "Clerk secret key", secret: true, placeholder: "sk_..." },
      { key: "STRIPE_SECRET_KEY", label: "Stripe secret key", secret: true },
    ],
  },
];

export const ALLOWED_SETTING_KEYS: string[] = SETTING_GROUPS.flatMap((g) =>
  g.fields.map((f) => f.key),
);

const SECRET_KEYS = new Set(
  SETTING_GROUPS.flatMap((g) => g.fields.filter((f) => f.secret).map((f) => f.key)),
);

/** All settings as a plain record (server-side use). */
export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await prisma.setting.findMany();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/**
 * Masked status for the UI: each managed key → whether it's set, and for
 * non-secret fields the actual value (so selects/region show current choice).
 */
export async function getSettingsStatus(): Promise<Record<string, { set: boolean; value?: string }>> {
  const all = await getAllSettings();
  const status: Record<string, { set: boolean; value?: string }> = {};
  for (const key of ALLOWED_SETTING_KEYS) {
    const raw = all[key] ?? process.env[key] ?? "";
    const set = raw.length > 0;
    status[key] = SECRET_KEYS.has(key) ? { set } : { set, value: raw };
  }
  return status;
}

/** Upsert (or clear) settings, accepting only whitelisted keys. */
export async function upsertSettings(input: Record<string, string>): Promise<void> {
  const ops = [];
  for (const [key, value] of Object.entries(input)) {
    if (!ALLOWED_SETTING_KEYS.includes(key)) continue;
    if (value && value.trim().length > 0) {
      ops.push(
        prisma.setting.upsert({
          where: { key },
          update: { value: value.trim() },
          create: { key, value: value.trim() },
        }),
      );
    } else {
      ops.push(prisma.setting.deleteMany({ where: { key } }));
    }
  }
  if (ops.length) await prisma.$transaction(ops);
}

/** Load all settings and overlay them onto process.env (live, no restart). */
export async function syncEnvFromDb(): Promise<void> {
  try {
    const all = await getAllSettings();
    setOverrides(all);
  } catch {
    // DB not reachable yet — ignore; env defaults still apply.
  }
}
