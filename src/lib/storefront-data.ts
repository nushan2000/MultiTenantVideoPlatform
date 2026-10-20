import { headers } from "next/headers";
import { cache } from "react";
import { resolveAds } from "./ads";
import { tenantDb } from "./db/client";
import { videoPath } from "./handles";
import { PAGE_SIZE } from "./pagination";
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

const skip = (page: number) => (page - 1) * PAGE_SIZE;

export async function homeData(t: ResolvedTenant, page = 1) {
  const db = tenantDb(t.id);
  const [featured, latest, total] = await Promise.all([
    page === 1 ? db.video.findMany({ where: { ...listed, featured: true }, orderBy: { createdAt: "desc" }, take: 4, include }) : Promise.resolve([]),
    db.video.findMany({ where: { ...listed }, orderBy: { createdAt: "desc" }, skip: skip(page), take: PAGE_SIZE, include }),
    db.video.count({ where: { ...listed } }),
  ]);
  return { featured: featured.map(toStoreVideo), latest: latest.map(toStoreVideo), total };
}

/** "Trending": most viewed first (all-time views; ties broken by newest). */
export async function trendingData(t: ResolvedTenant, page = 1) {
  const db = tenantDb(t.id);
  const [rows, total] = await Promise.all([
    db.video.findMany({ where: { ...listed }, orderBy: [{ views: "desc" }, { createdAt: "desc" }], skip: skip(page), take: PAGE_SIZE, include }),
    db.video.count({ where: { ...listed } }),
  ]);
  return { videos: rows.map(toStoreVideo), total };
}

export async function tagData(t: ResolvedTenant, tag: string, page = 1) {
  const db = tenantDb(t.id);
  const where = { ...listed, tags: { has: tag } };
  const [rows, total] = await Promise.all([
    db.video.findMany({ where, orderBy: { createdAt: "desc" }, skip: skip(page), take: PAGE_SIZE, include }),
    db.video.count({ where }),
  ]);
  return { videos: rows.map(toStoreVideo), total };
}

export async function categoryVideos(t: ResolvedTenant, categoryId: string, page = 1) {
  const db = tenantDb(t.id);
  const where = { ...listed, categoryId };
  const [rows, total] = await Promise.all([
    db.video.findMany({ where, orderBy: { createdAt: "desc" }, skip: skip(page), take: PAGE_SIZE, include }),
    db.video.count({ where }),
  ]);
  return { videos: rows.map(toStoreVideo), total };
}

/** Category chips for the home/listing pages (most populated first). */
export async function categoryChips(t: ResolvedTenant, limit = 12) {
  const cats = await tenantDb(t.id).category.findMany({ select: { slug: true, name: true, _count: { select: { videos: { where: { status: "READY", visibility: "PUBLIC" } } } } } });
  return cats.filter((c) => c._count.videos > 0).sort((a, b) => b._count.videos - a._count.videos).slice(0, limit).map((c) => ({ title: c.name, href: `/c/${c.slug}` }));
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
