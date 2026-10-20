import { route } from "@/lib/api";
import { apiVideo } from "@/lib/api-video";
import { audit } from "@/lib/audit";
import { maxImportBytes, EntitlementError } from "@/lib/entitlements";
import { importQueue } from "@/lib/ingest/queues";
import { HttpError } from "@/lib/ingest/types";
import { reserveQuota } from "@/lib/quota";
import { rateLimit } from "@/lib/rate-limit";

// POST /api/videos/:id/retry: re-run a FAILED URL import
export const POST = route(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { access, video } = await apiVideo(id);
  if (video.status !== "FAILED" || video.ingestMethod !== "URL" || !video.sourceUrl) throw new HttpError(409, "Only failed URL imports can be retried", "bad_state");
  if (!access.ent.canUseUrlImport) throw new EntitlementError("URL import is not available on your plan.", "import_disabled");
  await rateLimit(`import:user:${access.userRow.id}`, 10, 60);

  const reserved = await reserveQuota(access.tenant.id, maxImportBytes(access.ent), access.ent.storageLimitBytes, true);
  await access.db.video.updateMany({
    where: { id, status: "FAILED" },
    data: { status: "IMPORTING", failureReason: null, importProgress: 0, sizeBytes: BigInt(reserved) },
  });
  await importQueue().add("import", { tenantId: access.tenant.id, videoId: id, userId: access.userRow.id }, { jobId: `import-${id}-${Date.now()}` });
  await audit({ action: "import.retried", tenantId: access.tenant.id, userId: access.userRow.id, target: id, ip: access.ip, metadata: { url: video.sourceUrl } });
  return { ok: true };
});
