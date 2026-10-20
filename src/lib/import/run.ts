import { platformDb } from "../db/client";
import { audit } from "../audit";
import { entitlements, maxImportBytes } from "../entitlements";
import { failVideo, finalizeIngest } from "../ingest/finalize";
import { importPolicy } from "../ingest/url";
import { resizeReservation } from "../quota";
import { redis } from "../redis";
import { SsrfError, type SsrfPolicy } from "../ssrf";
import { deletePrefix, extOf, headObject, keys, uploadStream } from "../storage";
import { logger } from "../logger";
import { downloadToStorage, ImportError } from "./download";

export const progressKey = (videoId: string) => `import-progress:${videoId}`;

export type ImportOutcome = "done" | "skipped";

/**
 * Runs one URL import end to end. Throws ImportError on failure; the worker decides retry vs terminal failure
 * from `error.retryable` and the attempt count, then calls `failImport` for terminal cases.
 */
export async function runImport(
  tenantId: string,
  videoId: string,
  opts: { policy?: SsrfPolicy; hardTimeoutMs?: number } = {},
): Promise<ImportOutcome> {
  const video = await platformDb.video.findFirst({ where: { id: videoId, tenantId }, include: { tenant: { include: { plan: true } } } });
  if (!video || video.status !== "IMPORTING" || !video.sourceUrl) return "skipped";
  const ent = entitlements(video.tenant.plan.key);
  const reserved = Number(video.sizeBytes ?? 0);
  const perFile = maxImportBytes(ent);
  const maxBytes = Math.min(perFile, reserved);
  const r = await redis();
  const key = keys.source(tenantId, videoId, extOf(video.sourceUrl));

  let lastPct = -1;
  const progress = async (downloaded: number, total: number | null) => {
    await r.set(progressKey(videoId), JSON.stringify({ downloaded, total }), "EX", 3600).catch(() => {});
    if (total) {
      const pct = Math.min(99, Math.floor((downloaded / total) * 100));
      if (pct >= lastPct + 5) {
        lastPct = pct;
        await platformDb.video.updateMany({ where: { id: videoId, tenantId }, data: { importProgress: pct } });
      }
    }
  };

  try {
    const result = await downloadToStorage({
      url: video.sourceUrl,
      maxBytes,
      policy: opts.policy ?? importPolicy(),
      hardTimeoutMs: opts.hardTimeoutMs,
      onProgress: (d, t) => void progress(d, t),
      sink: (stream, contentType, signal) => uploadStream(key, stream, contentType, signal),
    });
    const stored = await headObject(key);
    if (!stored || stored.size !== result.bytes) throw new ImportError("unreachable", "The file could not be stored", true);
    await resizeReservation(tenantId, videoId, result.bytes); // true up the reservation to the real size
    await finalizeIngest(tenantId, videoId);
    await r.del(progressKey(videoId)).catch(() => {});
    await audit({ action: "import.completed", tenantId, target: videoId, metadata: { bytes: result.bytes, url: video.sourceUrl } });
    return "done";
  } catch (err) {
    await deletePrefix(key).catch(() => {}); // never leave a partial object behind
    if (err instanceof ImportError && err.code === "too_large" && reserved < perFile) {
      throw new ImportError("too_large", "Not enough storage space left for this file", false);
    }
    throw err;
  }
}

/** Human-readable reason, then terminal failure (quota released). */
export async function failImport(tenantId: string, videoId: string, err: unknown): Promise<void> {
  let reason = "The import failed";
  if (err instanceof ImportError) reason = err.message;
  else if (err instanceof SsrfError) reason = "That address is not allowed";
  logger.warn({ tenantId, videoId, reason }, "import failed");
  await failVideo(tenantId, videoId, reason);
  await audit({ action: "import.failed", tenantId, target: videoId, metadata: { reason } });
}
