import "dotenv/config";
import { Worker } from "bullmq";
import { platformDb } from "@/lib/db/client";
import { verifyDomain } from "@/lib/domains";
import { dropUploadSession, getUploadSession } from "@/lib/ingest/direct";
import { failVideo } from "@/lib/ingest/finalize";
import { maintenanceQueue, QUEUES } from "@/lib/ingest/queues";
import { logger } from "@/lib/logger";
import { bullConnection } from "@/lib/redis";
import { abortMultipart, deletePrefix, keys } from "@/lib/storage";

const HOUR = 3600_000;

/** Abort multipart uploads never completed within 24 h (frees storage + the quota reservation); time out stuck imports. */
export async function sweepUploads() {
  const stale = await platformDb.video.findMany({ where: { status: "UPLOADING", createdAt: { lt: new Date(Date.now() - 24 * HOUR) } }, take: 200 });
  for (const v of stale) {
    const session = await getUploadSession(v.id);
    if (session) await abortMultipart(session.key, session.uploadId);
    await dropUploadSession(v.id);
    await failVideo(v.tenantId, v.id, "Upload expired: it was not completed within 24 hours");
    await deletePrefix(keys.videoPrefix(v.tenantId, v.id)).catch(() => {});
  }
  const stuck = await platformDb.video.findMany({ where: { status: "IMPORTING", createdAt: { lt: new Date(Date.now() - 6 * HOUR) } }, take: 200 });
  for (const v of stuck) await failVideo(v.tenantId, v.id, "The import timed out");
  if (stale.length || stuck.length) logger.info({ expiredUploads: stale.length, timedOutImports: stuck.length }, "sweep done");
}

/** Re-check DNS for every domain that isn't live yet (PENDING -> VERIFIED -> ACTIVE) and re-validate live ones. */
export async function verifyDomains() {
  const domains = await platformDb.customDomain.findMany({ where: { status: { in: ["PENDING", "VERIFIED", "ACTIVE"] } }, take: 500, select: { id: true } });
  for (const d of domains) await verifyDomain(d.id).catch((err) => logger.warn({ err: String(err), id: d.id }, "domain verification error"));
}

const worker = new Worker(
  QUEUES.maintenance,
  async (job) => {
    if (job.name === "sweep-uploads") return sweepUploads();
    if (job.name === "verify-domains") return verifyDomains();
  },
  { connection: bullConnection(), concurrency: 1 },
);
worker.on("error", (err) => logger.error({ err: String(err) }, "maintenance worker error"));

(async () => {
  const q = maintenanceQueue();
  await q.upsertJobScheduler("sweep-uploads", { every: 10 * 60_000 }, { name: "sweep-uploads" });
  await q.upsertJobScheduler("verify-domains", { every: 60_000 }, { name: "verify-domains" });
  logger.info("maintenance worker started (domain verification every 60s, upload sweep every 10m)");
})();

const stop = async () => {
  await worker.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
