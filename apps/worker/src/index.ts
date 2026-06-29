import "./load-env.js";
import { createServer } from "node:http";
import { Worker, getConnection, QUEUE_NAMES } from "@ava/queue";
import type { QueueName } from "@ava/types";
import { loadEnv } from "@ava/config";
import { syncEnvFromDb } from "@ava/db";
import { processors } from "./processors/index.js";
import { logger } from "./lib/logger.js";

// Overlay UI-saved API keys from the DB before reading env / starting workers.
await syncEnvFromDb().catch(() => undefined);

const env = loadEnv();
const connection = getConnection();

// Per-queue concurrency. Heavy stages (generation, render, export) are throttled;
// light DB-bound stages run more in parallel.
const concurrencyFor: Partial<Record<QueueName, number>> = {
  "generate-assets": env.WORKER_CONCURRENCY,
  render: 1,
  "quality-check": 1,
  export: env.WORKER_CONCURRENCY,
};

const workers = QUEUE_NAMES.map((name) => {
  const worker = new Worker(name, processors[name], {
    connection,
    concurrency: concurrencyFor[name] ?? 5,
  });
  worker.on("completed", (job) => logger.info(`✓ ${name} #${job.id}`));
  worker.on("failed", (job, err) =>
    logger.error(`✗ ${name} #${job?.id ?? "?"}: ${err?.message ?? "unknown error"}`),
  );
  worker.on("error", (err) => logger.error(`${name} worker error: ${err.message}`));
  return worker;
});

logger.info(
  `AUTO VISUAL AI worker online — listening on ${QUEUE_NAMES.length} queues: ${QUEUE_NAMES.join(", ")}`,
);

// Tiny health server so a process manager (e.g. the dev preview) can keep the
// worker alive and detect it's up. The worker itself does no HTTP work.
const healthPort = Number(process.env.WORKER_PORT) || 8788;
createServer((_req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ status: "ok", role: "worker", queues: QUEUE_NAMES.length }));
}).listen(healthPort, () => logger.info(`worker health server on http://localhost:${healthPort}`));

async function shutdown(signal: string) {
  logger.info(`${signal} received — closing ${workers.length} workers...`);
  await Promise.all(workers.map((w) => w.close()));
  await connection.quit();
  logger.info("Shutdown complete.");
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
