import { z } from "zod";
import { tenantDb } from "../db/client";
import { entitlements, EntitlementError, maxImportBytes } from "../entitlements";
import { getEnv } from "../env";
import { releaseReservation, reserveQuota, QuotaError } from "../quota";
import { defaultPolicy, validateUrl, SsrfError, type SsrfPolicy } from "../ssrf";
import { audit } from "../audit";
import { assertCanAddVideos } from "./direct";
import { importQueue } from "./queues";
import type { IngestContext, IngestMethod } from "./types";
import { HttpError } from "./types";

export const importSchema = z
  .object({
    url: z.string().max(2048).optional(),
    urls: z.array(z.string().max(2048)).max(50).optional(),
    title: z.string().trim().max(200).optional(),
    rightsConfirmed: z.boolean(),
  })
  .refine((v) => v.url || (v.urls && v.urls.length), { message: "Provide url or urls" });
export type UrlImportInput = z.infer<typeof importSchema>;

export type UrlImportItem = { url: string; videoId?: string; error?: string; code?: string };
export type UrlImportResult = { items: UrlImportItem[] };

/** Hosts nobody may import from: the platform's own domains and our own storage endpoints. */
export function blockedImportHosts(): string[] {
  const env = getEnv();
  const hosts = [env.PLATFORM_ROOT_DOMAIN, new URL(env.APP_URL).hostname];
  for (const u of [env.S3_ENDPOINT, env.S3_PUBLIC_ENDPOINT]) if (u) hosts.push(new URL(u).hostname);
  return [...new Set(hosts.filter((h) => h !== "localhost"))]; // localhost is already rejected by validateUrl
}
export const importPolicy = (): SsrfPolicy => defaultPolicy({ blockedHosts: blockedImportHosts() });

export const urlImport: IngestMethod<UrlImportInput, UrlImportResult> = {
  id: "URL",
  async start(ctx: IngestContext, input: UrlImportInput) {
    const e = entitlements(ctx.planKey);
    if (!e.canUseUrlImport) throw new EntitlementError("URL import is not available on your plan.", "import_disabled");
    // Legal: the user must affirm rights on every import; the timestamp is stored on each Video.
    if (!input.rightsConfirmed) throw new HttpError(400, "You must confirm you own or have rights to this content.", "rights_required");

    const urls = [...new Set((input.urls ?? (input.url ? [input.url] : [])).map((u) => u.trim()).filter(Boolean))];
    if (urls.length === 0) throw new HttpError(400, "No URLs provided", "invalid");
    if (urls.length > e.maxImportBatch) {
      throw new EntitlementError(`You can import up to ${e.maxImportBatch} URLs at a time on your plan.`, "batch_limit");
    }
    await assertCanAddVideos(ctx.tenantId, ctx.planKey, urls.length);

    const policy = importPolicy();
    const perFile = maxImportBytes(e);
    const db = tenantDb(ctx.tenantId);
    const items: UrlImportItem[] = [];

    for (const raw of urls) {
      // Syntax-level guard now (fast feedback); the full DNS/IP guard runs again in the worker on every hop.
      let url: URL;
      try {
        url = validateUrl(raw, policy);
      } catch (err) {
        items.push({ url: raw, error: err instanceof SsrfError ? err.message : "Invalid URL", code: "bad_url" });
        continue;
      }
      let reserved = 0;
      try {
        // Unknown size yet: reserve the per-file cap (or what's left); the worker shrinks it once it sees Content-Length.
        reserved = await reserveQuota(ctx.tenantId, perFile, e.storageLimitBytes, true);
      } catch (err) {
        items.push({ url: raw, error: err instanceof QuotaError ? "Storage quota exceeded" : "Could not reserve storage", code: "quota_exceeded" });
        continue;
      }
      const title = (urls.length === 1 && input.title) || decodeURIComponent(url.pathname.split("/").pop() || "").replace(/\.[^.]+$/, "") || url.hostname;
      let videoId: string | undefined;
      try {
        const video = await db.video.create({
          data: {
            title: title.slice(0, 200),
            status: "IMPORTING",
            ingestMethod: "URL",
            visibility: "PUBLIC",
            sourceUrl: url.toString(),
            sizeBytes: BigInt(reserved),
            rightsConfirmedAt: new Date(),
          } as any,
        });
        videoId = video.id;
        await importQueue().add("import", { tenantId: ctx.tenantId, videoId: video.id, userId: ctx.userId }, { jobId: `import-${video.id}-1` });
        items.push({ url: raw, videoId: video.id });
        await audit({ action: "import.requested", tenantId: ctx.tenantId, userId: ctx.userId, target: video.id, ip: ctx.ip, metadata: { url: url.toString() } });
      } catch (err) {
        if (videoId) {
          await releaseReservation(ctx.tenantId, videoId);
          await db.video.deleteMany({ where: { id: videoId } });
        }
        items.push({ url: raw, error: "Could not start the import", code: "internal" });
      }
    }
    return { items };
  },
};
