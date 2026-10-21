import { z } from "zod";
import { tenantDb } from "./db/client";
import { slugifyHandle, stripText } from "./seo";
import { toStoreVideo } from "./storefront-data";
import type { ResolvedTenant } from "./tenancy/resolve";

export const MAX_PLAYLISTS = 50;
export const MAX_ITEMS = 200;

const text = (max: number) => z.string().max(max * 2).transform(stripText).pipe(z.string().max(max));
export const playlistInput = z.object({
  title: text(80).pipe(z.string().min(1, "Give the playlist a title")),
  description: text(500).optional(),
  published: z.boolean().optional(),
});
export const playlistPatch = playlistInput.partial().extend({
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes").max(60).optional(),
  videoIds: z.array(z.string().min(1)).max(MAX_ITEMS).optional(),
});

/** First free slug for a title ("my-list", "my-list-2", ...). */
export function uniqueSlug(title: string, taken: Set<string>): string {
  const base = slugifyHandle(title).slice(0, 50) || "playlist";
  let slug = base;
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
  return slug;
}

const listed = { status: "READY", visibility: "PUBLIC" } as const;

/** One published playlist with its public, ready videos in the owner's order. Null when missing or unpublished. */
export async function playlistData(t: ResolvedTenant, slug: string) {
  const db = tenantDb(t.id);
  const playlist = await db.playlist.findFirst({ where: { slug, published: true } });
  if (!playlist) return null;
  const items = await db.playlistItem.findMany({
    where: { playlistId: playlist.id, video: listed },
    orderBy: { position: "asc" },
    include: { video: { include: { category: { select: { name: true } } } } },
  });
  return { playlist, videos: items.map((i) => toStoreVideo(i.video)) };
}

/** Published playlists with at least `minVideos` public, ready videos (empty ones are not linked or listed). */
export async function publicPlaylists(tenantId: string, take = 50, minVideos = 1) {
  const rows = await tenantDb(tenantId).playlist.findMany({
    where: { published: true, items: { some: { video: listed } } },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    take: minVideos > 1 ? 500 : take,
    select: { slug: true, title: true, updatedAt: true, _count: { select: { items: { where: { video: listed } } } } },
  });
  return rows.filter((r) => r._count.items >= minVideos).slice(0, take);
}
