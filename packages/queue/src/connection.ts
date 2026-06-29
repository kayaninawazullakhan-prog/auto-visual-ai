import { Redis } from "ioredis";
import { loadEnv } from "@ava/config";

/**
 * Shared Redis connection for BullMQ. `maxRetriesPerRequest: null` is required
 * by BullMQ for blocking commands used by workers. The same instance is safe to
 * share with Queues; BullMQ duplicates it internally for blocking operations.
 */
let connection: Redis | null = null;

export function getConnection(): Redis {
  if (!connection) {
    connection = new Redis(loadEnv().REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return connection;
}
