import { z } from "zod";

/** Accepted source containers (per the Upload Engine spec). */
export const ACCEPTED_VIDEO_EXT = ["mp4", "mov", "avi", "mkv"] as const;
export const ACCEPTED_VIDEO_MIME = [
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "video/avi",
  "video/x-matroska",
] as const;

export const createProjectSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
});

export const createUploadSchema = z.object({
  projectId: z.string().cuid().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  filename: z.string().trim().min(1).max(300),
  mimeType: z.string().trim().min(1),
  sizeBytes: z.number().int().positive().max(20 * 1024 * 1024 * 1024), // 20 GB cap
});

export const completeUploadSchema = z.object({
  videoId: z.string().cuid(),
});

export const projectIdSchema = z.object({
  projectId: z.string().cuid(),
});

export const generateAssetsSchema = z.object({
  projectId: z.string().cuid(),
  segmentIds: z.array(z.string().cuid()).optional(),
});

export const subtitlesSchema = z.object({
  projectId: z.string().cuid(),
  mode: z.enum(["ENGLISH", "ORIGINAL", "DUAL"]).optional(),
  style: z.enum(["WORD_LEVEL", "KARAOKE", "TIKTOK", "REELS", "SHORTS", "HORMOZI"]).optional(),
  languages: z
    .array(z.enum(["EN", "HI", "UR", "AR", "ES", "FR", "DE", "PT"]))
    .optional(),
});

export const renderSchema = z.object({
  projectId: z.string().cuid(),
  presets: z
    .array(z.enum(["VERTICAL_HD", "VERTICAL_4K", "HORIZONTAL_4K", "SQUARE"]))
    .default(["VERTICAL_HD"]),
  format: z.enum(["MP4", "MOV"]).default("MP4"),
  codec: z.enum(["H264", "H265", "AV1"]).default("H264"),
});

export const approveSchema = z.object({
  projectId: z.string().cuid(),
  decisions: z
    .array(
      z.object({
        approvalId: z.string().cuid().optional(),
        assetId: z.string().cuid().optional(),
        segmentId: z.string().cuid().optional(),
        decision: z.enum([
          "APPROVED",
          "REJECTED",
          "REGENERATE",
          "EDIT_PROMPT",
          "SKIPPED",
        ]),
        note: z.string().max(2000).optional(),
        editedPrompt: z.string().max(4000).optional(),
      }),
    )
    .min(1),
});

export const brandingSchema = z.object({
  projectId: z.string().cuid(),
  username: z.string().trim().max(120).optional(),
  website: z.string().trim().max(200).optional(),
  socialHandle: z.string().trim().max(120).optional(),
  brandColors: z
    .object({
      primary: z.string().max(32).optional(),
      secondary: z.string().max(32).optional(),
      accent: z.string().max(32).optional(),
      text: z.string().max(32).optional(),
      background: z.string().max(32).optional(),
    })
    .optional(),
  fontFamily: z.string().trim().max(120).optional(),
  logoS3Key: z.string().max(512).optional(),
  watermarkS3Key: z.string().max(512).optional(),
  fontS3Key: z.string().max(512).optional(),
  placement: z
    .object({
      logo: z
        .object({
          corner: z.enum(["tl", "tr", "bl", "br"]),
          marginPx: z.number().int().min(0).max(400),
          widthPx: z.number().int().min(16).max(1080),
          opacity: z.number().min(0).max(1),
        })
        .optional(),
      watermark: z.object({ opacity: z.number().min(0).max(1), tiled: z.boolean().optional() }).optional(),
      handlePosition: z.enum(["top", "bottom"]).optional(),
    })
    .optional(),
});

export const brandingUploadSchema = z.object({
  projectId: z.string().cuid(),
  kind: z.enum(["logo", "watermark", "font"]),
  filename: z.string().trim().min(1).max(300),
  mimeType: z.string().trim().min(1),
});

export function fileExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}
