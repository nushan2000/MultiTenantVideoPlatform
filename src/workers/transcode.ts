import "dotenv/config";
import { UnrecoverableError, Worker } from "bullmq";
import { getEnv } from "@/lib/env";
import { failVideo } from "@/lib/ingest/finalize";
import { deadLetterQueue, QUEUES, type TranscodeJob } from "@/lib/ingest/queues";
import { logger } from "@/lib/logger";
import { bullConnection } from "@/lib/redis";
import { transcribeVideo } from "@/lib/transcribe";
import { ProcessError, processVideo } from "@/lib/transcode";

const env = getEnv();

const worker = new Worker<TranscodeJob>(
  QUEUES.transcode,
  async (job) => {
    const { tenantId, videoId } = job.data;
    try {
      const outcome = await processVideo(tenantId, videoId);
      // Automatic captions come after the video is already live and must never fail the job.
      if (outcome === "ready") await transcribeVideo(tenantId, videoId).catch((err) => logger.warn({ videoId, err: String(err) }, "automatic captions failed"));
      return outcome;
    } catch (err) {
      const retryable = err instanceof ProcessError ? err.retryable : true;
      const lastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (!retryable || lastAttempt) {
        await failVideo(tenantId, videoId, err instanceof ProcessError ? err.message : "Processing failed");
        throw new UnrecoverableError(err instanceof Error ? err.message : String(err));
      }
      logger.warn({ videoId, attempt: job.attemptsMade + 1, err: String(err) }, "transcode will retry with backoff");
      throw err;
    }
  },
  { connection: bullConnection(), concurrency: env.TRANSCODE_WORKER_CONCURRENCY },
);

// Dead-letter: terminally failed jobs are copied to a queue operators can inspect / replay.
worker.on("failed", async (job, err) => {
  if (!job) return;
  const final = err instanceof UnrecoverableError || job.attemptsMade >= (job.opts.attempts ?? 1);
  if (final) await deadLetterQueue().add("transcode-failed", { queue: QUEUES.transcode, data: job.data, reason: err.message }).catch(() => {});
});
worker.on("error", (err) => logger.error({ err: String(err) }, "transcode worker error"));
logger.info({ concurrency: env.TRANSCODE_WORKER_CONCURRENCY }, "transcode worker started");

const stop = async () => {
  await worker.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
