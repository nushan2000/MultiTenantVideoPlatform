import { tenantDb } from "@/lib/db/client";
import { parsePageSeo, parseSiteSeo, stripText, truncate } from "@/lib/seo";
import { videoPath } from "@/lib/handles";
import { absoluteUrl, canonicalOrigin } from "@/lib/seo-server";
import { mediaUrl } from "@/lib/storefront-data";
import { tenantForHost } from "@/lib/storefront";
import { parseFeatures } from "@/lib/theme";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

/**
 * Per-tenant sitemap with Google's video + image extensions. Lists only what should be indexed: PUBLIC + READY videos
 * (never unlisted/private/blocked), categories and videos not marked noindex, and nothing whose canonical points elsewhere.
 * Empty when the tenant asked for noindex. Absolute URLs use the canonical origin (custom domain if active).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ host: string }> }) {
  const tenant = await tenantForHost((await params).host);
  if (!tenant) return new Response("Not found", { status: 404 });
  const features = parseFeatures(tenant.features);
  const siteSeo = parseSiteSeo(tenant.seo);
  const origin = await canonicalOrigin(tenant);
  const entries: string[] = [];

  if (!features.noindex) {
    const db = tenantDb(tenant.id);
    const videos = await db.video.findMany({
      where: { status: "READY", visibility: "PUBLIC" }, orderBy: { createdAt: "desc" }, take: 5000,
      include: { category: { select: { name: true } } },
    });
    const newest = videos.reduce<Date | null>((m, v) => (!m || v.updatedAt > m ? v.updatedAt : m), null);
    entries.push(`<url><loc>${esc(origin + "/")}</loc>${newest ? `<lastmod>${newest.toISOString()}</lastmod>` : ""}<changefreq>daily</changefreq><priority>1.0</priority></url>`);

    if (features.categories) {
      for (const c of await db.category.findMany({ select: { slug: true, seo: true } })) {
        const cs = parsePageSeo(c.seo);
        if (cs.noindex || (cs.canonicalUrl && cs.canonicalUrl !== `${origin}/c/${c.slug}`)) continue;
        entries.push(`<url><loc>${esc(`${origin}/c/${c.slug}`)}</loc><changefreq>daily</changefreq><priority>0.6</priority></url>`);
      }
    }

    for (const v of videos) {
      const vs = parsePageSeo(v.seo);
      const loc = `${origin}${videoPath(v)}`;
      if (vs.noindex || (vs.canonicalUrl && vs.canonicalUrl !== loc)) continue;
      const thumb = absoluteUrl(origin, vs.ogImage || mediaUrl(v.thumbnailPath));
      const title = truncate(stripText(vs.title || v.title), 100);
      const desc = truncate(stripText(vs.description || v.description || `Watch ${v.title} on ${tenant.name}`), 2000);
      const video = thumb
        ? `<video:video><video:thumbnail_loc>${esc(thumb)}</video:thumbnail_loc><video:title>${esc(title)}</video:title><video:description>${esc(desc)}</video:description>` +
          `<video:player_loc>${esc(`${origin}/embed/${v.id}`)}</video:player_loc>` +
          (v.durationSec ? `<video:duration>${Math.min(v.durationSec, 28800)}</video:duration>` : "") +
          `<video:publication_date>${v.createdAt.toISOString()}</video:publication_date><video:view_count>${v.views}</video:view_count>` +
          `<video:family_friendly>${tenant.contentCategory === "ADULT" ? "no" : "yes"}</video:family_friendly></video:video>`
        : "";
      entries.push(
        `<url><loc>${esc(loc)}</loc><lastmod>${v.updatedAt.toISOString()}</lastmod><priority>0.8</priority>` +
          (thumb ? `<image:image><image:loc>${esc(thumb)}</image:loc><image:title>${esc(title)}</image:title></image:image>` : "") +
          video + `</url>`,
      );
    }
  }
  void siteSeo;
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n` +
    entries.join("\n") + `\n</urlset>`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=300" } });
}
