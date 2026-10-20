import type { PageSeo } from "./seo";
import { parsePageSeo } from "./seo";

/** Minimal shape of a tenant-scoped client for the lookups below (works with tenantDb()). */
type Db = {
  video: { findFirst: (a: any) => Promise<any> };
  category: { findFirst: (a: any) => Promise<any> };
};

export const videoRef = (v: { id: string; seo: unknown }) => parsePageSeo(v.seo).handle ?? v.id;
export const videoPath = (v: { id: string; seo: unknown }) => `/v/${videoRef(v)}`;
export const categoryPath = (c: { slug: string }) => `/c/${c.slug}`;

/**
 * Resolve /v/<ref>: by id, then current handle, then retired handle.
 * `redirect` is set when the request used an id or retired handle, so the caller can 308 to the canonical URL.
 */
export async function findVideoByRef<T = any>(db: Db, ref: string, where: object = {}, include?: object): Promise<{ video: T; redirect: boolean } | null> {
  const byId = await db.video.findFirst({ where: { id: ref, ...where }, include });
  if (byId) return { video: byId, redirect: !!parsePageSeo(byId.seo).handle };
  const byHandle = await db.video.findFirst({ where: { seo: { path: ["handle"], equals: ref }, ...where }, include });
  if (byHandle) return { video: byHandle, redirect: false };
  const old = await db.video.findFirst({ where: { seo: { path: ["previousHandles"], array_contains: ref }, ...where }, include });
  return old ? { video: old, redirect: true } : null;
}

export async function findCategoryByRef<T = any>(db: Db, ref: string): Promise<{ category: T; redirect: boolean } | null> {
  const cur = await db.category.findFirst({ where: { slug: ref } });
  if (cur) return { category: cur, redirect: false };
  const old = await db.category.findFirst({ where: { seo: { path: ["previousHandles"], array_contains: ref } } });
  return old ? { category: old, redirect: true } : null;
}

/** Is `handle` already used by another video (as id, current or retired handle)? */
export async function videoHandleTaken(db: Db, handle: string, exceptId: string): Promise<boolean> {
  const hit = await db.video.findFirst({
    where: { id: { not: exceptId }, OR: [{ seo: { path: ["handle"], equals: handle } }, { seo: { path: ["previousHandles"], array_contains: handle } }] },
    select: { id: true },
  });
  return !!hit;
}

/** Next stored SEO JSON for a page when its handle changes: remember the old one so it keeps redirecting. */
export function withHandleHistory(prev: PageSeo, nextHandle: string | undefined, currentPublicRef: string | undefined): PageSeo["previousHandles"] {
  const history = new Set(prev.previousHandles);
  if (currentPublicRef && nextHandle !== currentPublicRef) history.add(currentPublicRef);
  if (nextHandle) history.delete(nextHandle);
  return [...history].slice(-25);
}
