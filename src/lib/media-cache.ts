import { platformDb } from "./db/client";
import { redis } from "./redis";

// /api/media is hit for every HLS segment. The access decision for a video is cached briefly so each segment doesn't cost a DB query.
// Anything that changes who may watch (visibility, takedown, delete, tenant suspension) calls invalidateMediaCache().

export type MediaAccess = { status: string; visibility: string; tenantStatus: string; planKey: string };
const TTL = 15;
const k = (tenantId: string, videoId: string) => `media:acc:${tenantId}:${videoId}`;

export async function mediaAccess(tenantId: string, videoId: string): Promise<MediaAccess | null> {
  let r: Awaited<ReturnType<typeof redis>> | null = null;
  try {
    r = await redis();
    const hit = await r.get(k(tenantId, videoId));
    if (hit) return hit === "none" ? null : (JSON.parse(hit) as MediaAccess);
  } catch {
    r = null;
  }
  const v = await platformDb.video.findFirst({
    where: { id: videoId, tenantId },
    select: { status: true, visibility: true, tenant: { select: { status: true, plan: { select: { key: true } } } } },
  });
  const out: MediaAccess | null = v ? { status: v.status, visibility: v.visibility, tenantStatus: v.tenant.status, planKey: v.tenant.plan.key } : null;
  if (r) await r.set(k(tenantId, videoId), out ? JSON.stringify(out) : "none", "EX", out ? TTL : 5).catch(() => {});
  return out;
}

export async function invalidateMediaCache(tenantId: string, videoId: string): Promise<void> {
  try {
    await (await redis()).del(k(tenantId, videoId));
  } catch {
    /* the TTL bounds staleness */
  }
}
