import { platformDb } from "./db/client";
import { logger } from "./logger";
import { invalidateMediaCache } from "./media-cache";
import { notifyVideo } from "./seo-notify";

/**
 * Scheduled publishing: videos whose `publishAt` has passed become PUBLIC. Safe to run often and from several workers:
 * the conditional update only matches rows still due. A BLOCKED video never goes public; its schedule is just cleared.
 */
export async function publishDueVideos(now = new Date()): Promise<number> {
  const due = await platformDb.video.findMany({ where: { publishAt: { lte: now } }, take: 200, select: { id: true, tenantId: true, status: true } });
  let published = 0;
  for (const v of due) {
    const res = await platformDb.video.updateMany({
      where: { id: v.id, publishAt: { lte: now } },
      data: v.status === "BLOCKED" ? { publishAt: null } : { visibility: "PUBLIC", publishAt: null },
    });
    if (res.count === 0) continue;
    await invalidateMediaCache(v.tenantId, v.id);
    if (v.status !== "BLOCKED") {
      published++;
      void notifyVideo(v.tenantId, v.id); // IndexNow (no-op until the video is READY)
    }
  }
  if (published) logger.info({ published }, "scheduled videos published");
  return published;
}
