import { canonicalOrigin } from "@/lib/seo-server";
import { tenantForHost } from "@/lib/storefront";
import { parseFeatures } from "@/lib/theme";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ host: string }> }) {
  const tenant = await tenantForHost((await params).host);
  if (!tenant) return new Response("Not found", { status: 404 });
  const noindex = parseFeatures(tenant.features).noindex;
  const origin = await canonicalOrigin(tenant);
  // Keep crawlers out of API/search/embed noise (internal search pages are thin duplicates); media stays crawlable for thumbnails.
  const body = noindex
    ? "User-agent: *\nDisallow: /\n"
    : `User-agent: *\nAllow: /api/media/\nDisallow: /api/\nDisallow: /search\nDisallow: /embed/\n\nSitemap: ${origin}/sitemap.xml\n`;
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300" } });
}
