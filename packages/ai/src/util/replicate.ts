import { loadEnv } from "@ava/config";

interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: unknown;
  error?: string;
  urls?: { get?: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- Global pacing across the whole process so we stay under Replicate's
//     per-minute "create prediction" rate limit (free tier ≈ 6/min, burst 1). ---
let createChain: Promise<unknown> = Promise.resolve();
let lastCreateAt = 0;

/** Serialize create-slot acquisition so creates start ≥ minIntervalMs apart. */
function pacedCreate<T>(minIntervalMs: number, fn: () => Promise<T>): Promise<T> {
  const result = createChain.then(async () => {
    const wait = Math.max(0, lastCreateAt + minIntervalMs - Date.now());
    if (wait > 0) await sleep(wait);
    lastCreateAt = Date.now();
    return fn();
  });
  createChain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function fetchWithRateLimit(
  url: string,
  init: RequestInit,
  maxRetries = 8,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    if (res.status !== 429 && res.status !== 529) return res;
    if (attempt >= maxRetries) return res;
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(30_000, 1500 * 2 ** attempt);
    await sleep(waitMs);
  }
}

/** Create a Replicate prediction by model name and poll until it resolves.
 *  Paced + retried so rate-limited accounts succeed instead of failing 429. */
export async function runReplicate(
  model: string,
  input: Record<string, unknown>,
  opts: { timeoutMs?: number } = {},
): Promise<unknown> {
  const env = loadEnv();
  const token = env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN is not set");
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const created = await pacedCreate(env.REPLICATE_MIN_INTERVAL_MS, () =>
    fetchWithRateLimit(`https://api.replicate.com/v1/models/${model}/predictions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ input }),
    }),
  );
  if (!created.ok) {
    throw new Error(`Replicate create failed (${created.status}): ${await created.text()}`);
  }

  let pred = (await created.json()) as ReplicatePrediction;
  const getUrl = pred.urls?.get ?? `https://api.replicate.com/v1/predictions/${pred.id}`;
  const deadline = Date.now() + (opts.timeoutMs ?? 10 * 60 * 1000);

  while (!["succeeded", "failed", "canceled"].includes(pred.status)) {
    if (Date.now() > deadline) throw new Error("Replicate prediction timed out");
    await sleep(2000);
    const poll = await fetchWithRateLimit(getUrl, { headers: { Authorization: `Bearer ${token}` } });
    pred = (await poll.json()) as ReplicatePrediction;
  }

  if (pred.status !== "succeeded") {
    throw new Error(`Replicate prediction ${pred.status}: ${pred.error ?? "unknown error"}`);
  }
  return pred.output;
}
