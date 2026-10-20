import "dotenv/config";
import { DelayedError, UnrecoverableError, Worker } from "bullmq";
import { platformDb } from "@/lib/db/client";
import { entitlements } from "@/lib/entitlements";
import { getEnv } from "@/lib/env";
import { ImportError } from "@/lib/import/download";
import { failImport, runImport } from "@/lib/import/run";
import { deadLetterQueue, QUEUES, type ImportJob } from "@/lib/ingest/queues";
import { logger } from "@/lib/logger";
import { bullConnection, redis } from "@/lib/redis";

// Runs in its OWN process with its OWN concurrency, separate from transcoding. Deploy it with egress limited to the
// public internet (see ARCHITECTURE.md: firewall rules), so even an SSRF-guard bug can't reach postgres/redis/storage
// directly; it only needs to reach them through their own ports.
const env = getEnv();

const worker = new Worker<ImportJob>(
  QUEUES.import,
  async (job, token) => {
    const { tenantId, videoId } = job.data;
    const video = await platformDb.video.findFirst({ where: { id: videoId, tenantId }, include: { tenant: { include: { plan: true } } } });
    if (!video || video.status !== "IMPORTING") return;

    // Per-tenant concurrency cap from the plan (config, not code): over the cap -> wait, without burning a retry.
    const ent = entitlements(video.tenant.plan.key);
    const r = await redis();
    const activeKey = `import-active:${tenantId}`;
    const active = await r.incr(activeKey);
    await r.expire(activeKey, 3600);
    if (active > ent.maxConcurrentImports) {
      await r.decr(activeKey);
      await job.moveToDelayed(Date.now() + 5000, token);
      throw new DelayedError();
    }
    try {
      await runImport(tenantId, videoId);
    } catch (err) {
      const retryable = err instanceof ImportError ? err.retryable : true;
      const lastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (!retryable || lastAttempt) {
        await failImport(tenantId, videoId, err);
        throw new UnrecoverableError(err instanceof Error ? err.message : String(err));
      }
      logger.info({ videoId, attempt: job.attemptsMade + 1, err: String(err) }, "import will retry with backoff");
      throw err; // BullMQ exponential backoff
    } finally {
      await r.decr(activeKey).catch(() => {});
    }
  },
  { connection: bullConnection(), concurrency: env.IMPORT_WORKER_CONCURRENCY },
);

worker.on("failed", async (job, err) => {
  if (!job) return;
  const final = err instanceof UnrecoverableError || job.attemptsMade >= (job.opts.attempts ?? 1);
  if (final) await deadLetterQueue().add("import-failed", { queue: QUEUES.import, data: job.data, reason: err.message }).catch(() => {});
});
worker.on("error", (err) => logger.error({ err: String(err) }, "import worker error"));
logger.info({ concurrency: env.IMPORT_WORKER_CONCURRENCY }, "import worker started");

const stop = async () => {
  await worker.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
