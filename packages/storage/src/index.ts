import { Readable } from "node:stream";
import { writeFile } from "node:fs/promises";
import { loadEnv } from "@ava/config";
import * as s3 from "./s3.js";
import * as local from "./local.js";

export { s3Keys } from "./s3.js";
export { baseDir, pathFor } from "./local.js";

export type StorageDriver = "s3" | "local";

/** Active storage backend: explicit STORAGE_DRIVER, else s3 if AWS keys exist, else local. */
export function storageDriver(): StorageDriver {
  const env = loadEnv();
  if (env.STORAGE_DRIVER === "s3") return "s3";
  if (env.STORAGE_DRIVER === "local") return "local";
  return env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY && env.S3_BUCKET ? "s3" : "local";
}

const isS3 = () => storageDriver() === "s3";

// --- Driver-delegated operations ------------------------------------------
export function presignUpload(key: string, contentType: string, ttl?: number): Promise<string> {
  return isS3() ? s3.presignUpload(key, contentType, ttl) : local.presignUpload(key, contentType, ttl);
}
export function presignDownload(key: string, ttl?: number): Promise<string> {
  return isS3() ? s3.presignDownload(key, ttl) : local.presignDownload(key, ttl);
}
export function publicUrl(key: string): string {
  return isS3() ? s3.publicUrl(key) : local.publicUrl(key);
}
export function putObject(
  key: string,
  body: Buffer | Uint8Array | string | Readable,
  contentType?: string,
): Promise<void> {
  return isS3() ? s3.putObject(key, body, contentType) : local.putObject(key, body, contentType);
}
export function getObjectStream(key: string): Promise<Readable> {
  return isS3() ? s3.getObjectStream(key) : local.getObjectStream(key);
}
export function downloadToFile(key: string, destPath: string): Promise<void> {
  return isS3() ? s3.downloadToFile(key, destPath) : local.downloadToFile(key, destPath);
}
export function objectExists(key: string): Promise<boolean> {
  return isS3() ? s3.objectExists(key) : local.objectExists(key);
}
export function deleteObject(key: string): Promise<void> {
  return isS3() ? s3.deleteObject(key) : local.deleteObject(key);
}

// --- Driver-agnostic helpers ----------------------------------------------
/** Fetch an http(s) or data: URL into a Buffer (+ detected content-type). */
export async function fetchBinary(url: string): Promise<{ buffer: Buffer; contentType?: string }> {
  if (url.startsWith("data:")) {
    const match = /^data:([^;]+);base64,(.*)$/s.exec(url);
    if (!match) throw new Error("Invalid data URI");
    return { buffer: Buffer.from(match[2]!, "base64"), contentType: match[1] };
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`);
  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get("content-type") ?? undefined,
  };
}

/** Copy a provider asset URL straight into storage (handles http + data URIs). */
export async function uploadFromUrl(url: string, key: string, contentType?: string): Promise<void> {
  const { buffer, contentType: detected } = await fetchBinary(url);
  await putObject(key, buffer, contentType ?? detected);
}

/** Download an http(s)/data URL to a local file (e.g. before ffmpeg). */
export async function downloadUrlToFile(url: string, destPath: string): Promise<void> {
  const { buffer } = await fetchBinary(url);
  await writeFile(destPath, buffer);
}

const MIME_BY_EXT: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export function mimeForKey(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

/**
 * A URL an external provider (Replicate, Runway, …) can fetch as input. With S3
 * that's a presigned https URL; with local storage we return a base64 data URI
 * so it works even though localhost isn't publicly reachable.
 */
export async function assetInputUrl(key: string): Promise<string> {
  if (isS3()) return s3.presignDownload(key, 3600);
  const stream = await local.getObjectStream(key);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const buf = Buffer.concat(chunks);
  return `data:${mimeForKey(key)};base64,${buf.toString("base64")}`;
}
