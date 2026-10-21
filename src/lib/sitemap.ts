import { tenantDb, tenantTx } from "./db/client";
import { videoPath } from "./handles";
import { systemPagesFor } from "./pages/system";
import { loadPages } from "./pages/store";
import { publicPlaylists } from "./playlists";
import { parsePageSeo, stripText, truncate } from "./seo";
import { absoluteUrl } from "./seo-server";
import { mediaUrl } from "./storefront-data";
import { parseFeatures } from "./theme";
import type { ResolvedTenant } from "./tenancy/resolve";

export const VIDEOS_PER_SITEMAP = 1000;
export const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

const NS = 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"';
export const urlset = (entries: string[]) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset ${NS}>\n${entries.join("\n")}\n</urlset>`;
export const xmlResponse = (xml: string) => new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=300" } });

const listed = { status: "READY", visibility: "PUBLIC" } as const;

/** /sitemap.xml: an index (Google allows 50,000 URLs per file; we use 1,000 videos per file so each stays small and fast). */
export async function buildIndex(t: ResolvedTenant, origin: string): Promise<string> {
  const features = parseFeatures(t.features);
  const parts: { loc: string; lastmod?: string }[] = [];
  if (!features.noindex) {
    const db = tenantDb(t.id);
    const [count, newest] = await Promise.all([db.video.count({ where: listed }), db.video.findFirst({ where: listed, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } })]);
    parts.push({ loc: `${origin}/sitemaps/main.xml`, lastmod: newest?.updatedAt.toISOString() });
    for (let i = 1; i <= Math.max(1, Math.ceil(count / VIDEOS_PER_SITEMAP)); i++) if (count > 0) parts.push({ loc: `${origin}/sitemaps/videos-${i}.xml`, lastmod: newest?.updatedAt.toISOString() });
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${parts.map((p) => `<sitemap><loc>${esc(p.loc)}</loc>${p.lastmod ? `<lastmod>${p.lastmod}</lastmod>` : ""}</sitemap>`).join("\n")}\n</sitemapindex>`;
}

/** Home, trending, categories, category pages, tag pages (2+ videos), and published pages. */
export async function buildMain(t: ResolvedTenant, origin: string): Promise<string[]> {
  const features = parseFeatures(t.features);
  if (features.noindex) return [];
  const db = tenantDb(t.id);
  const entries: string[] = [`<url><loc>${esc(origin + "/")}</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`, `<url><loc>${esc(origin + "/trending")}</loc><changefreq>daily</changefreq><priority>0.7</priority></url>`];
  if (features.categories) {
    entries.push(`<url><loc>${esc(origin + "/categories")}</loc><changefreq>weekly</changefreq><priority>0.6</priority></url>`);
    for (const c of await db.category.findMany({ select: { slug: true, seo: true } })) {
      const cs = parsePageSeo(c.seo);
      if (cs.noindex || (cs.canonicalUrl && cs.canonicalUrl !== `${origin}/c/${c.slug}`)) continue;
      entries.push(`<url><loc>${esc(`${origin}/c/${c.slug}`)}</loc><changefreq>daily</changefreq><priority>0.6</priority></url>`);
    }
  }
  // tag pages only when they have real content (2+ videos); thin tag pages are noindex'd on the page itself
  const tags = await tenantTx(t.id, (tx) =>
    tx.$queryRaw<{ tag: string }[]>`SELECT tag FROM "Video", unnest(tags) AS tag WHERE "tenantId" = ${t.id} AND status = 'READY' AND visibility = 'PUBLIC' GROUP BY tag HAVING count(*) >= 2 ORDER BY count(*) DESC LIMIT 500`,
  );
  for (const { tag } of tags) entries.push(`<url><loc>${esc(`${origin}/tag/${tag}`)}</loc><changefreq>weekly</changefreq><priority>0.4</priority></url>`);

  // playlists with 2+ public videos (a one-video playlist is noindex)
  for (const pl of await publicPlaylists(t.id, 200, 2)) entries.push(`<url><loc>${esc(`${origin}/playlist/${pl.slug}`)}</loc><lastmod>${pl.updatedAt.toISOString()}</lastmod><changefreq>weekly</changefreq><priority>0.5</priority></url>`);

  const pages = await loadPages(t, origin);
  for (const p of pages) {
    if (!p.published || p.seo.noindex || (p.seo.canonicalUrl && p.seo.canonicalUrl !== `${origin}/${p.slug}`)) continue;
    entries.push(`<url><loc>${esc(`${origin}/${p.slug}`)}</loc>${p.updatedAt ? `<lastmod>${p.updatedAt.toISOString()}</lastmod>` : ""}<changefreq>monthly</changefreq><priority>${p.group === "legal" ? "0.2" : "0.4"}</priority></url>`);
  }
  void systemPagesFor;
  return entries;
}

/** One chunk of video URLs with Google's video + image extensions. */
export async function buildVideos(t: ResolvedTenant, origin: string, chunk: number): Promise<string[]> {
  const features = parseFeatures(t.features);
  if (features.noindex) return [];
  const videos = await tenantDb(t.id).video.findMany({ where: listed, orderBy: { createdAt: "desc" }, skip: (chunk - 1) * VIDEOS_PER_SITEMAP, take: VIDEOS_PER_SITEMAP, include: { category: { select: { name: true } } } });
  const entries: string[] = [];
  for (const v of videos) {
    const vs = parsePageSeo(v.seo);
    const loc = `${origin}${videoPath(v)}`;
    if (vs.noindex || (vs.canonicalUrl && vs.canonicalUrl !== loc)) continue;
    const thumb = absoluteUrl(origin, vs.ogImage || mediaUrl(v.thumbnailPath?.replace(/thumb\.jpg$/, "thumb-lg.jpg")));
    const title = truncate(stripText(vs.title || v.title), 100);
    const desc = truncate(stripText(vs.description || v.description || `Watch ${v.title} on ${t.name}`), 2000);
    const tags = (v.tags as string[]).slice(0, 32);
    const video = thumb
      ? `<video:video><video:thumbnail_loc>${esc(thumb)}</video:thumbnail_loc><video:title>${esc(title)}</video:title><video:description>${esc(desc)}</video:description>` +
        `<video:player_loc>${esc(`${origin}/embed/${v.id}`)}</video:player_loc>` +
        (v.durationSec ? `<video:duration>${Math.min(v.durationSec, 28800)}</video:duration>` : "") +
        `<video:publication_date>${v.createdAt.toISOString()}</video:publication_date><video:view_count>${v.views}</video:view_count>` +
        tags.map((g) => `<video:tag>${esc(g.replace(/-/g, " "))}</video:tag>`).join("") +
        (v.category ? `<video:category>${esc(v.category.name)}</video:category>` : "") +
        `<video:family_friendly>${t.contentCategory === "ADULT" ? "no" : "yes"}</video:family_friendly></video:video>`
      : "";
    entries.push(
      `<url><loc>${esc(loc)}</loc><lastmod>${v.updatedAt.toISOString()}</lastmod><priority>0.8</priority>` +
        (thumb ? `<image:image><image:loc>${esc(thumb)}</image:loc><image:title>${esc(title)}</image:title></image:image>` : "") + video + `</url>`,
    );
  }
  return entries;
}
