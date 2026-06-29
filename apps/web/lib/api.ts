import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { MissingProviderKeyError } from "@ava/config";

/** Typed HTTP error thrown by route handlers and mapped to a response. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const unauthorized = (m = "Unauthorized") => new HttpError(401, m, "unauthorized");
export const forbidden = (m = "Forbidden") => new HttpError(403, m, "forbidden");
export const notFound = (m = "Not found") => new HttpError(404, m, "not_found");
export const badRequest = (m = "Bad request") => new HttpError(400, m, "bad_request");
export const conflict = (m = "Conflict") => new HttpError(409, m, "conflict");

/**
 * JSON response that safely serializes BigInt (Prisma `sizeBytes`) as strings.
 */
export function ok(data: unknown, init?: ResponseInit): NextResponse {
  const body = JSON.stringify(data, (_k, v) =>
    typeof v === "bigint" ? v.toString() : v,
  );
  return new NextResponse(body, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response> | Response;

/** Wraps a route handler with consistent error → HTTP mapping. */
export function route<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) {
        return ok({ error: err.message, code: err.code }, { status: err.status });
      }
      if (err instanceof ZodError) {
        return ok(
          { error: "Validation failed", code: "validation_error", details: err.flatten() },
          { status: 422 },
        );
      }
      if (err instanceof MissingProviderKeyError) {
        return ok(
          { error: err.message, code: "provider_not_configured" },
          { status: 503 },
        );
      }
      console.error("[api] unhandled error:", err);
      return ok({ error: "Internal server error", code: "internal" }, { status: 500 });
    }
  };
}

/** Parse + validate a JSON body with a zod schema. */
export async function parseBody<T>(req: Request, schema: { parse: (v: unknown) => T }): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw badRequest("Invalid JSON body");
  }
  return schema.parse(json);
}
