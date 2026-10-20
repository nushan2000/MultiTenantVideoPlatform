import { headers } from "next/headers";
import { cache } from "react";
import { resolveAds } from "./ads";
import { tenantDb } from "./db/client";
import { videoPath } from "./handles";
import type { ResolvedTenant } from "./tenancy/resolve";
import type { StoreVideo } from "@/templates/types";

export const mediaUrl = (path: string | null | undefined) => (path ? `/api/media/${path}` : null);

type Row = {
  id: string; title: string; description: string | null; thumbnailPath: string | null; durationSec: number | null;
  views: number; createdAt: Date; seo: unknown; category?: { name: string } | null;
};
export const toStoreVideo = (v: Row): StoreVideo => ({
  id: v.id, href: videoPath(v), title: v.title, description: v.description, thumbUrl: mediaUrl(v.thumbnailPath), durationSec: v.durationSec,
  views: v.views, createdAt: v.createdAt, categoryName: v.category?.name ?? null,
});

const include = { category: { select: { name: true } } } as const;
const listed = { status: "READY", visibility: "PUBLIC" } as const;

export async function homeData(t: ResolvedTenant) {
  const db = tenantDb(t.id);
  const [featured, latest] = await Promise.all([
    db.video.findMany({ where: { ...listed, featured: true }, orderBy: { createdAt: "desc" }, take: 4, include }),
    db.video.findMany({ where: { ...listed }, orderBy: { createdAt: "desc" }, take: 24, include }),
  ]);
  return { featured: featured.map(toStoreVideo), latest: latest.map(toStoreVideo) };
}

export async function searchVideos(t: ResolvedTenant, q: string) {
  const term = q.trim().slice(0, 100);
  if (!term) return [];
  const rows = await tenantDb(t.id).video.findMany({
    where: { ...listed, OR: [{ title: { contains: term, mode: "insensitive" } }, { description: { contains: term, mode: "insensitive" } }] },
    orderBy: { createdAt: "desc" }, take: 48, include,
  });
  return rows.map(toStoreVideo);
}

export const adsForTenant = cache((t: ResolvedTenant) => resolveAds({ id: t.id, planKey: t.planKey, contentCategory: t.contentCategory }));

/** Absolute origin of the current storefront (for canonical URLs / sitemap). */
export async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "production" ? "https" : "http");
  return `${proto}://${host}`;
}
