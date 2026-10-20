import Redis from "ioredis";
import { getEnv } from "./env";

const globalForRedis = globalThis as unknown as { redis?: Redis };

/** Shared client for cache/rate-limit/progress. (BullMQ makes its own connections.) */
export function getRedis(): Redis {
  if (!globalForRedis.redis) {
    const r = new Redis(getEnv().REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false });
    r.on("error", () => {
      /* surfaced per call; cache failures must never take the site down */
    });
    globalForRedis.redis = r;
  }
  return globalForRedis.redis;
}

/** Ensure connected (lazyConnect + no offline queue means the first command would otherwise fail). */
export async function redis() {
  const r = getRedis();
  if (r.status === "wait" || r.status === "end") await r.connect();
  return r;
}

/** Connection options for BullMQ (it needs maxRetriesPerRequest: null). */
export function bullConnection() {
  const u = new URL(getEnv().REDIS_URL);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    password: u.password || undefined,
    maxRetriesPerRequest: null as null,
  };
}
