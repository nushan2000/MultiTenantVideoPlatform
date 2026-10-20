import { getRedis } from "./redis";
import { logger } from "./logger";

export class RateLimitError extends Error {
  constructor(public readonly retryAfterSec: number) {
    super("Too many requests, slow down.");
  }
}

/** Fixed-window limiter in Redis. Fails OPEN if Redis is down (logged), so an outage doesn't lock everyone out. */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<void> {
  try {
    const redis = getRedis();
    const k = `rl:${key}`;
    const n = await redis.incr(k);
    if (n === 1) await redis.expire(k, windowSec);
    if (n > limit) throw new RateLimitError(Math.max(await redis.ttl(k), 1));
  } catch (err) {
    if (err instanceof RateLimitError) throw err;
    logger.warn({ err: String(err), key }, "rate limiter unavailable, failing open");
  }
}

export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
