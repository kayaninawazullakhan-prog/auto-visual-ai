import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "node:stream";
import { pipeline as streamPipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import { loadEnv, MissingProviderKeyError } from "@ava/config";

let client: S3Client | null = null;

function requireStorage() {
  const env = loadEnv();
  if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY || !env.S3_BUCKET) {
    throw new MissingProviderKeyError("aws-s3", [
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
      "S3_BUCKET",
    ]);
  }
}

export function s3(): S3Client {
  requireStorage();
  const env = loadEnv();
  if (!client) {
    client = new S3Client({
      region: env.AWS_REGION,
      // S3_ENDPOINT lets you target MinIO / LocalStack in dev.
      ...(env.S3_ENDPOINT
        ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true }
        : {}),
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }
  return client;
}

export function bucket(): string {
  requireStorage();
  return loadEnv().S3_BUCKET!;
}

/** Deterministic S3 key layout for every artifact type. */
export const s3Keys = {
  original: (projectId: string, filename: string) =>
    `projects/${projectId}/source/${filename}`,
  audio: (projectId: string) => `projects/${projectId}/audio/audio.wav`,
  asset: (projectId: string, assetId: string, ext: string) =>
    `projects/${projectId}/assets/${assetId}.${ext}`,
  thumbnail: (projectId: string, assetId: string) =>
    `projects/${projectId}/assets/${assetId}.thumb.jpg`,
  render: (projectId: string, renderId: string, ext = "mp4") =>
    `projects/${projectId}/renders/${renderId}.${ext}`,
  export: (projectId: string, exportId: string, ext = "mp4") =>
    `projects/${projectId}/exports/${exportId}.${ext}`,
  branding: (projectId: string, name: string) =>
    `projects/${projectId}/branding/${name}`,
};

/** Presigned PUT URL for direct browser → S3 upload. */
export async function presignUpload(
  key: string,
  contentType: string,
  expiresIn = 3600,
): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: bucket(),
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3(), cmd, { expiresIn });
}

/** Presigned GET URL for time-limited downloads (exports, previews). */
export async function presignDownload(key: string, expiresIn = 3600): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: bucket(), Key: key });
  return getSignedUrl(s3(), cmd, { expiresIn });
}

export async function putObject(
  key: string,
  body: Buffer | Uint8Array | string | Readable,
  contentType?: string,
): Promise<void> {
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function getObjectStream(key: string): Promise<Readable> {
  const res = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  return res.Body as Readable;
}

/** Stream an object from S3 to a local file (used by the media pipeline). */
export async function downloadToFile(key: string, destPath: string): Promise<void> {
  const body = await getObjectStream(key);
  await streamPipeline(body, createWriteStream(destPath));
}

export async function deleteObject(key: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return true;
  } catch {
    return false;
  }
}

/** Public delivery URL (CloudFront / S3 website / MinIO). */
export function publicUrl(key: string): string {
  const env = loadEnv();
  if (env.S3_PUBLIC_URL) return `${env.S3_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
  if (env.S3_ENDPOINT)
    return `${env.S3_ENDPOINT.replace(/\/$/, "")}/${env.S3_BUCKET}/${key}`;
  return `https://${env.S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${key}`;
}
