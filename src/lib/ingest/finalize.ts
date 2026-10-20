import { platformDb } from "../db/client";
import { transcodeQueue } from "./queues";

/**
 * The single hand-off point from either ingest method into the shared processing path:
 * source object is in storage -> status PROCESSING -> one transcode job. Idempotent (jobId == video id).
 */
export async function finalizeIngest(tenantId: string, videoId: string): Promise<void> {
  await platformDb.video.updateMany({
    where: { id: videoId, tenantId, status: { in: ["UPLOADING", "IMPORTING", "PROCESSING"] } },
    data: { status: "PROCESSING", failureReason: null },
  });
  await transcodeQueue().add("transcode", { tenantId, videoId }, { jobId: `transcode-${videoId}` });
}

/** Terminal failure for any stage: record a human-readable reason and give the quota back. */
export async function failVideo(tenantId: string, videoId: string, reason: string): Promise<void> {
  const { releaseReservation } = await import("../quota");
  await releaseReservation(tenantId, videoId);
  await platformDb.video.updateMany({
    where: { id: videoId, tenantId, status: { notIn: ["READY", "BLOCKED"] } },
    data: { status: "FAILED", failureReason: reason.slice(0, 300) },
  });
}
