import { platformDb } from "./db/client";
import { videoPath } from "./handles";
import { entitlements } from "./entitlements";
import { indexNowKey, submitIndexNow } from "./indexnow";
import { siteUrl } from "./site-url";
import { parseFeatures } from "./theme";

/** Public origin of a tenant without a request (workers, API routes): active custom domain else the free subdomain. */
export async function tenantOrigin(tenantId: string): Promise<{ origin: string; indexable: boolean } | null> {
  const t = await platformDb.tenant.findUnique({ where: { id: tenantId }, include: { plan: true, domains: { where: { status: "ACTIVE" }, take: 1 } } });
  if (!t || t.status !== "ACTIVE") return null;
  const custom = entitlements(t.plan.key).canUseCustomDomain ? t.domains[0]?.hostname : undefined;
  return { origin: custom ? `https://${custom}` : siteUrl(t.slug), indexable: !parseFeatures(t.features).noindex };
}

/** Tell IndexNow engines about changed/removed URLs of a tenant. No-op without INDEXNOW_KEY or for noindex sites. */
export async function notifyPaths(tenantId: string, paths: string[]): Promise<void> {
  if (!indexNowKey()) return;
  const o = await tenantOrigin(tenantId);
  if (o?.indexable) await submitIndexNow(o.origin, paths);
}

export async function notifyVideo(tenantId: string, videoId: string): Promise<void> {
  if (!indexNowKey()) return;
  const v = await platformDb.video.findFirst({ where: { id: videoId, tenantId }, select: { id: true, seo: true, visibility: true, status: true } });
  if (v && v.status === "READY" && v.visibility === "PUBLIC") await notifyPaths(tenantId, [videoPath(v), "/"]);
}
