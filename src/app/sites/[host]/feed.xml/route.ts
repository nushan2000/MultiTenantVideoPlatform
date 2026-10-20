import { tenantDb } from "@/lib/db/client";
import { videoPath } from "@/lib/handles";
import { parsePageSeo, parseSiteSeo, stripText, truncate } from "@/lib/seo";
import { absoluteUrl, canonicalOrigin } from "@/lib/seo-server";
import { esc } from "@/lib/sitemap";
import { mediaUrl } from "@/lib/storefront-data";
import { tenantForHost } from "@/lib/storefront";
import { parseFeatures } from "@/lib/theme";

export const dynamic = "force-dynamic";

/** RSS 2.0 + Media RSS feed of the latest public videos (for readers, aggregators and video discovery). Empty for noindex sites. */
export async function GET(_req: Request, { params }: { params: Promise<{ host: string }> }) {
  const tenant = await tenantForHost((await params).host);
  if (!tenant) return new Response("Not found", { status: 404 });
  const origin = await canonicalOrigin(tenant);
  const seo = parseSiteSeo(tenant.seo);
  const items = parseFeatures(tenant.features).noindex
    ? []
    : await tenantDb(tenant.id).video.findMany({ where: { status: "READY", visibility: "PUBLIC" }, orderBy: { createdAt: "desc" }, take: 50, include: { category: { select: { name: true } } } });
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:atom="http://www.w3.org/2005/Atom"><channel>` +
    `<title>${esc(tenant.name)}</title><link>${esc(origin + "/")}</link><description>${esc(seo.homeDescription || `Latest videos from ${tenant.name}`)}</description><language>${esc((seo.locale ?? "en").replace("_", "-"))}</language>` +
    `<atom:link href="${esc(origin + "/feed.xml")}" rel="self" type="application/rss+xml"/>` +
    items.map((v) => {
      const vs = parsePageSeo(v.seo);
      const link = `${origin}${videoPath(v)}`;
      const thumb = absoluteUrl(origin, vs.ogImage || mediaUrl(v.thumbnailPath));
      return `<item><title>${esc(truncate(stripText(vs.title || v.title), 120))}</title><link>${esc(link)}</link><guid isPermaLink="true">${esc(link)}</guid><pubDate>${v.createdAt.toUTCString()}</pubDate>` +
        `<description>${esc(truncate(stripText(vs.description || v.description || v.title), 500))}</description>${v.category ? `<category>${esc(v.category.name)}</category>` : ""}` +
        `<media:content url="${esc(`${origin}/embed/${v.id}`)}" medium="video" type="text/html"${v.durationSec ? ` duration="${v.durationSec}"` : ""}>${thumb ? `<media:thumbnail url="${esc(thumb)}"/>` : ""}<media:title>${esc(truncate(stripText(v.title), 100))}</media:title></media:content></item>`;
    }).join("") +
    `</channel></rss>`;
  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=300" } });
}
