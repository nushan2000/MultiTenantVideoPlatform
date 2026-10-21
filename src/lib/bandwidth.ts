import { baseClient, platformDb } from "./db/client";
import { entitlements } from "./entitlements";
import { redis } from "./redis";

// Live counter in Redis (cheap, atomic), persisted to BandwidthUsage by the maintenance worker so a Redis restart loses at most a minute.
// Counts bytes this origin serves. Behind a CDN only cache misses reach us: use CDN logs for exact numbers and keep this as a safety net.

export const monthKey = (d = new Date()) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const key = (tenantId: string, month: string) => `bw:${tenantId}:${month}`;

/** Add served bytes. Never throws: metering must not break playback. */
export async function addBandwidth(tenantId: string, bytes: number): Promise<void> {
  if (!(bytes > 0)) return;
  try {
    const r = await redis();
    const k = key(tenantId, monthKey());
    const total = await r.incrby(k, Math.round(bytes));
    if (total === Math.round(bytes)) {
      // first write of the month in Redis: seed from the database so a flushed Redis doesn't reset the meter
      const row = await platformDb.bandwidthUsage.findUnique({ where: { tenantId_month: { tenantId, month: monthKey() } } });
      if (row && row.bytes > 0n) await r.incrby(k, Number(row.bytes));
      await r.expire(k, 70 * 86400);
    }
  } catch {
    /* ignore */
  }
}

export async function bandwidthUsed(tenantId: string): Promise<number> {
  try {
    const v = await (await redis()).get(key(tenantId, monthKey()));
    if (v !== null) return Number(v);
  } catch {
    /* fall through to the database */
  }
  const row = await platformDb.bandwidthUsage.findUnique({ where: { tenantId_month: { tenantId, month: monthKey() } } });
  return row ? Number(row.bytes) : 0;
}

export async function bandwidthStatus(tenantId: string, planKey: string) {
  const limit = entitlements(planKey).bandwidthLimitBytes;
  const used = await bandwidthUsed(tenantId);
  return { used, limit, over: used >= limit, percent: Math.min(100, Math.round((used / limit) * 100)) };
}

/** Copy live counters into the database (monotonic: never lowers a stored value). */
export async function flushBandwidth(): Promise<number> {
  const r = await redis();
  let n = 0;
  let cursor = "0";
  do {
    const [next, found] = await r.scan(cursor, "MATCH", "bw:*", "COUNT", 200);
    cursor = next;
    for (const k of found) {
      const [, tenantId, month] = k.split(":");
      const v = Number(await r.get(k));
      if (!tenantId || !month || !(v > 0)) continue;
      // Raw SQL is not covered by the platformDb model extension, so set the RLS bypass explicitly (same transaction = same connection).
      await baseClient.$transaction([
        baseClient.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`,
        baseClient.$executeRaw`
          INSERT INTO "BandwidthUsage" (id, "tenantId", month, bytes) VALUES (gen_random_uuid()::text, ${tenantId}, ${month}, ${BigInt(v)})
          ON CONFLICT ("tenantId", month) DO UPDATE SET bytes = GREATEST("BandwidthUsage".bytes, EXCLUDED.bytes)`,
      ]);
      n++;
    }
  } while (cursor !== "0");
  return n;
}
