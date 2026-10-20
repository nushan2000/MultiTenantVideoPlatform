import { z } from "zod";
import { humanizeFilename } from "../media-meta";
import { tenantDb } from "../db/client";
import { entitlements, EntitlementError } from "../entitlements";
import { releaseReservation, reserveQuota } from "../quota";
import { redis } from "../redis";
import { createMultipart, extOf, isVideoExtension, keys, listParts, PART_SIZE } from "../storage";
import type { IngestContext, IngestMethod } from "./types";
import { HttpError } from "./types";

export const directInitSchema = z.object({
  filename: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive(),
  contentType: z.string().max(100).default("video/mp4"),
  title: z.string().trim().max(200).optional(),
});
export type DirectInit = z.infer<typeof directInitSchema>;
export type DirectResult = { videoId: string; partSize: number; totalParts: number };

export type UploadSession = { uploadId: string; key: string; size: number; partSize: number };
const sessionKey = (videoId: string) => `upload:${videoId}`;
export const UPLOAD_TTL_SEC = 24 * 3600;

export async function getUploadSession(videoId: string): Promise<UploadSession | null> {
  const raw = await (await redis()).get(sessionKey(videoId));
  return raw ? (JSON.parse(raw) as UploadSession) : null;
}
export async function dropUploadSession(videoId: string) {
  const r = await redis();
  await r.del(sessionKey(videoId), partsKey(videoId));
}

// Parts the browser reports (S3 needs each part's ETag to complete). Used when the store can't ListParts.
const partsKey = (videoId: string) => `upload-parts:${videoId}`;

export async function recordPart(videoId: string, partNumber: number, etag: string) {
  const r = await redis();
  await r.hset(partsKey(videoId), String(partNumber), etag);
  await r.expire(partsKey(videoId), UPLOAD_TTL_SEC + 3600);
}

export type PartInfo = { PartNumber: number; ETag: string; Size: number };

/** What the store actually has: ListParts when supported (authoritative), else the parts the client reported. */
export async function getParts(videoId: string, session: UploadSession): Promise<PartInfo[]> {
  try {
    return await listParts(session.key, session.uploadId);
  } catch {
    const reported = await (await redis()).hgetall(partsKey(videoId));
    const total = Math.ceil(session.size / session.partSize);
    return Object.entries(reported).map(([n, etag]) => {
      const PartNumber = Number(n);
      // size is derived from the plan of the upload, never trusted from the client
      const Size = PartNumber === total ? session.size - session.partSize * (total - 1) : session.partSize;
      return { PartNumber, ETag: etag, Size };
    });
  }
}

/** Shared pre-flight for any new video: plan video-count limit. */
export async function assertCanAddVideos(tenantId: string, planKey: string, adding = 1) {
  const e = entitlements(planKey);
  const count = await tenantDb(tenantId).video.count({ where: { status: { not: "FAILED" } } });
  if (count + adding > e.maxVideos) {
    throw new EntitlementError(`Your plan allows up to ${e.maxVideos} videos.`, "video_limit");
  }
}

export const directUpload: IngestMethod<DirectInit, DirectResult> = {
  id: "DIRECT",
  async start(ctx: IngestContext, input: DirectInit) {
    const e = entitlements(ctx.planKey);
    const ext = extOf(input.filename);
    const rawExt = /\.([a-z0-9]{1,6})$/i.exec(input.filename)?.[1] ?? "";
    const looksVideo = input.contentType.startsWith("video/") || isVideoExtension(rawExt);
    if (!looksVideo) throw new HttpError(400, "Only video files can be uploaded", "not_video");
    if (input.sizeBytes > e.maxUploadBytes) {
      throw new EntitlementError(`Files can be at most ${Math.floor(e.maxUploadBytes / 1024 ** 2)} MB on your plan.`, "too_large");
    }
    await assertCanAddVideos(ctx.tenantId, ctx.planKey);

    // Reserve BEFORE creating anything, so concurrent uploads can't exceed the plan.
    await reserveQuota(ctx.tenantId, input.sizeBytes, e.storageLimitBytes);
    const db = tenantDb(ctx.tenantId);
    const title = input.title || humanizeFilename(input.filename);
    let videoId: string | undefined;
    try {
      const video = await db.video.create({
        data: {
          title,
          status: "UPLOADING",
          ingestMethod: "DIRECT",
          visibility: "PUBLIC",
          sizeBytes: BigInt(input.sizeBytes), // == reservation until READY
        } as any,
      });
      videoId = video.id;
      const key = keys.source(ctx.tenantId, video.id, ext);
      const uploadId = await createMultipart(key, input.contentType.startsWith("video/") ? input.contentType : "video/mp4");
      const session: UploadSession = { uploadId, key, size: input.sizeBytes, partSize: PART_SIZE };
      await (await redis()).set(sessionKey(video.id), JSON.stringify(session), "EX", UPLOAD_TTL_SEC + 3600);
      return { videoId: video.id, partSize: PART_SIZE, totalParts: Math.ceil(input.sizeBytes / PART_SIZE) };
    } catch (err) {
      if (videoId) {
        await releaseReservation(ctx.tenantId, videoId);
        await db.video.deleteMany({ where: { id: videoId } });
      } else {
        // reservation made but video row never created: give it back directly
        const { tenantTx } = await import("../db/client");
        await tenantTx(ctx.tenantId, (tx) =>
          tx.storageUsage.update({ where: { tenantId: ctx.tenantId }, data: { bytesReserved: { decrement: BigInt(input.sizeBytes) } } }),
        );
      }
      throw err;
    }
  },
};
