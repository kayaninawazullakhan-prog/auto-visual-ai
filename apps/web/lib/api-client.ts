/**
 * Tiny typed fetch wrappers for client components. Both throw an `ApiError`
 * (carrying the HTTP status + parsed body) on a non-2xx response so callers can
 * branch on `err.status` / `err.code` (e.g. 503 provider_not_configured).
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await res.text();
  let body: unknown = undefined;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    const rec = (body ?? {}) as { error?: string; code?: string };
    throw new ApiError(
      res.status,
      rec.error || `Request failed (${res.status})`,
      rec.code,
      body,
    );
  }

  return body as T;
}

export function apiGet<T>(url: string, init?: RequestInit): Promise<T> {
  return request<T>(url, { ...init, method: "GET" });
}

export function apiPost<T>(url: string, data?: unknown, init?: RequestInit): Promise<T> {
  return request<T>(url, {
    ...init,
    method: "POST",
    body: data === undefined ? undefined : JSON.stringify(data),
  });
}
