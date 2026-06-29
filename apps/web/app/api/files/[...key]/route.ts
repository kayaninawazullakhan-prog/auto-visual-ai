import { Readable } from "node:stream";
import {
  storageDriver,
  putObject,
  getObjectStream,
  objectExists,
  mimeForKey,
} from "@ava/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ key: string[] }> };

const notFound = () => new Response("Not found", { status: 404 });

/** Serve a file from local storage (only when the local driver is active). */
export async function GET(_req: Request, { params }: Ctx) {
  if (storageDriver() !== "local") return notFound();
  const { key } = await params;
  const k = key.join("/");
  if (!(await objectExists(k))) return notFound();
  const stream = await getObjectStream(k);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "content-type": mimeForKey(k),
      "cache-control": "private, max-age=3600",
    },
  });
}

/**
 * Accept a direct (presigned-style) upload into local storage. The body is
 * STREAMED to disk — buffering via req.arrayBuffer() is silently capped at 10MB,
 * which truncated large videos (missing moov atom → ffprobe failure).
 */
export async function PUT(req: Request, { params }: Ctx) {
  if (storageDriver() !== "local") return notFound();
  const { key } = await params;
  const k = key.join("/");
  if (!req.body) return new Response("No body", { status: 400 });
  const nodeStream = Readable.fromWeb(req.body as unknown as import("node:stream/web").ReadableStream<Uint8Array>);
  await putObject(k, nodeStream, req.headers.get("content-type") ?? undefined);
  return new Response(null, { status: 200 });
}
