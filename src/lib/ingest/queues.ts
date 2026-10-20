import { Queue, type QueueOptions } from "bullmq";
import { bullConnection } from "../redis";

export const QUEUES = {
  import: "video-import",
  transcode: "video-transcode",
  deadLetter: "video-dead-letter",
  maintenance: "maintenance",
} as const;

export type TranscodeJob = { tenantId: string; videoId: string };
export type ImportJob = { tenantId: string; videoId: string; userId: string | null };

const cache = new Map<string, Queue>();
function queue<T>(name: string, defaults: Partial<QueueOptions> = {}): Queue<T> {
  let q = cache.get(name);
  if (!q) {
    q = new Queue(name, { connection: bullConnection(), ...defaults } as QueueOptions);
    cache.set(name, q);
  }
  return q as Queue<T>;
}

// Exponential backoff for transient failures; finished jobs trimmed, failed ones kept for inspection.
const retry = { attempts: 4, backoff: { type: "exponential" as const, delay: 5_000 }, removeOnComplete: 1000, removeOnFail: 5000 };

export const importQueue = () => queue<ImportJob>(QUEUES.import, { defaultJobOptions: retry });
export const transcodeQueue = () => queue<TranscodeJob>(QUEUES.transcode, { defaultJobOptions: retry });
export const deadLetterQueue = () => queue<Record<string, unknown>>(QUEUES.deadLetter, { defaultJobOptions: { removeOnComplete: false } });
export const maintenanceQueue = () => queue<Record<string, unknown>>(QUEUES.maintenance);
