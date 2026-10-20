import { tenantTx, type Tx } from "./db/client";

export class QuotaError extends Error {
  constructor(message = "Storage quota exceeded") {
    super(message);
  }
}

type UsageRow = { bytesUsed: bigint; bytesReserved: bigint };

async function lockUsage(tx: Tx, tenantId: string): Promise<UsageRow> {
  await tx.storageUsage.upsert({ where: { tenantId }, update: {}, create: { tenantId } });
  const rows = await tx.$queryRaw<UsageRow[]>`SELECT "bytesUsed", "bytesReserved" FROM "StorageUsage" WHERE "tenantId" = ${tenantId} FOR UPDATE`;
  return rows[0];
}

/**
 * Atomically reserve up to `wantBytes` (row-locked, so concurrent uploads/imports can't oversell the plan).
 * `partial: true` grants whatever fits (used by URL imports with unknown size); otherwise all-or-nothing.
 * Returns bytes granted. Throws QuotaError when nothing fits.
 */
export function reserveQuota(tenantId: string, wantBytes: number, limitBytes: number, partial = false): Promise<number> {
  return tenantTx(tenantId, async (tx) => {
    const u = await lockUsage(tx, tenantId);
    const free = Math.max(limitBytes - Number(u.bytesUsed) - Number(u.bytesReserved), 0);
    const grant = partial ? Math.min(wantBytes, free) : wantBytes <= free ? wantBytes : 0;
    if (grant <= 0) throw new QuotaError();
    await tx.storageUsage.update({ where: { tenantId }, data: { bytesReserved: { increment: BigInt(grant) } } });
    return grant;
  });
}

/** Shrink/grow what a not-yet-finished video holds (Video.sizeBytes == its reservation until READY). */
export function resizeReservation(tenantId: string, videoId: string, newBytes: number): Promise<void> {
  return tenantTx(tenantId, async (tx) => {
    await lockUsage(tx, tenantId);
    const v = await tx.video.findFirst({ where: { id: videoId, tenantId }, select: { sizeBytes: true, status: true } });
    if (!v || v.status === "READY") return;
    const old = v.sizeBytes ?? 0n;
    await tx.storageUsage.update({ where: { tenantId }, data: { bytesReserved: { increment: BigInt(newBytes) - old } } });
    await tx.video.update({ where: { id: videoId }, data: { sizeBytes: BigInt(newBytes) } });
  });
}

/** Idempotent: releases a video's reservation exactly once (zeroes Video.sizeBytes). */
export function releaseReservation(tenantId: string, videoId: string): Promise<void> {
  return tenantTx(tenantId, async (tx) => {
    await lockUsage(tx, tenantId);
    const v = await tx.video.findFirst({ where: { id: videoId, tenantId }, select: { sizeBytes: true, status: true } });
    if (!v || v.status === "READY" || !v.sizeBytes) return;
    await tx.storageUsage.update({ where: { tenantId }, data: { bytesReserved: { decrement: v.sizeBytes } } });
    await tx.video.update({ where: { id: videoId }, data: { sizeBytes: 0n } });
  });
}

/** Reservation -> real usage when a video becomes READY. `extra` runs in the same transaction. Idempotent. */
export function settleQuota(tenantId: string, videoId: string, finalBytes: number, extra: (tx: Tx) => Promise<void>): Promise<void> {
  return tenantTx(tenantId, async (tx) => {
    await lockUsage(tx, tenantId);
    const v = await tx.video.findFirst({ where: { id: videoId, tenantId }, select: { sizeBytes: true, status: true } });
    if (!v || v.status === "READY") return;
    await tx.storageUsage.update({
      where: { tenantId },
      data: { bytesReserved: { decrement: v.sizeBytes ?? 0n }, bytesUsed: { increment: BigInt(finalBytes) } },
    });
    await tx.video.update({ where: { id: videoId }, data: { sizeBytes: BigInt(finalBytes) } });
    await extra(tx);
  });
}

/** Free the bytes of a deleted video (reserved or used, depending on its status). */
export function freeVideoBytes(tenantId: string, videoId: string): Promise<void> {
  return tenantTx(tenantId, async (tx) => {
    await lockUsage(tx, tenantId);
    const v = await tx.video.findFirst({ where: { id: videoId, tenantId }, select: { sizeBytes: true, status: true } });
    if (!v?.sizeBytes) return;
    await tx.storageUsage.update({
      where: { tenantId },
      data: v.status === "READY" ? { bytesUsed: { decrement: v.sizeBytes } } : { bytesReserved: { decrement: v.sizeBytes } },
    });
  });
}
