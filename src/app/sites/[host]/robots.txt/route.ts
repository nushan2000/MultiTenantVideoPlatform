import { canonicalOrigin } from "@/lib/seo-server";
import { tenantForHost } from "@/lib/storefront";
import { parseFeatures } from "@/lib/theme";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ host: string }> }) {
  const tenant = await tenantForHost((await params).host);
  if (!tenant) return new Response("Not found", { status: 404 });
  const noindex = parseFeatures(tenant.features).noindex;
  const origin = await canonicalOrigin(tenant);
  // Crawl budget: block the API, internal search and the embed player. Media: thumbnails/captions/branding stay crawlable, but the
  // HLS playlists and .ts segments (thousands of useless files per video) are blocked. (Google also gets X-Robots-Tag on those.)
  const body = noindex
    ? "User-agent: *\nDisallow: /\n"
    : [
        "User-agent: *",
        "Allow: /api/media/tenants/*/branding/",
        "Allow: /api/media/tenants/*/videos/*/thumb",
        "Allow: /api/media/tenants/*/videos/*/captions/",
        "Disallow: /api/",
        "Disallow: /search",
        "Disallow: /embed/",
        "",
        `Sitemap: ${origin}/sitemap.xml`,
        "",
      ].join("\n");
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300" } });
}
