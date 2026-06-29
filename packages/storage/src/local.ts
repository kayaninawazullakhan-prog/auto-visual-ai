import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, copyFile, stat, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline as streamPipeline } from "node:stream/promises";
import { loadEnv } from "@ava/config";

/**
 * Local filesystem storage driver — no cloud account required. Files live under
 * LOCAL_STORAGE_DIR (default <repo>/.data/storage) and are served by the web app
 * at /api/files/<key>. URLs point at APP_URL so the browser, Remotion, and ffmpeg
 * can all fetch them on the same machine.
 */
export function baseDir(): string {
  const env = loadEnv();
  if (env.LOCAL_STORAGE_DIR) return resolve(env.LOCAL_STORAGE_DIR);
  // This file is packages/storage/src/local.ts → repo root is three up.
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../.data/storage");
}

export function pathFor(key: string): string {
  // Prevent path traversal escaping the storage root.
  const safe = key.split("/").filter((p) => p && p !== "." && p !== "..").join("/");
  return join(baseDir(), safe);
}

function encodeKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

function appUrl(): string {
  return loadEnv().APP_URL.replace(/\/$/, "");
}

export async function presignUpload(key: string, _contentType: string, _ttl?: number): Promise<string> {
  return `${appUrl()}/api/files/${encodeKey(key)}`;
}

export async function presignDownload(key: string, _ttl?: number): Promise<string> {
  return `${appUrl()}/api/files/${encodeKey(key)}`;
}

export function publicUrl(key: string): string {
  return `${appUrl()}/api/files/${encodeKey(key)}`;
}

export async function putObject(
  key: string,
  body: Buffer | Uint8Array | string | Readable,
  _contentType?: string,
): Promise<void> {
  const p = pathFor(key);
  await mkdir(dirname(p), { recursive: true });
  if (body instanceof Readable) {
    await streamPipeline(body, createWriteStream(p));
  } else {
    await writeFile(p, body);
  }
}

export async function getObjectStream(key: string): Promise<Readable> {
  return createReadStream(pathFor(key));
}

export async function downloadToFile(key: string, destPath: string): Promise<void> {
  await mkdir(dirname(destPath), { recursive: true });
  await copyFile(pathFor(key), destPath);
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await stat(pathFor(key));
    return true;
  } catch {
    return false;
  }
}

export async function deleteObject(key: string): Promise<void> {
  await rm(pathFor(key), { force: true });
}
