import { canonicalOrigin } from "@/lib/seo-server";
import { buildMain, buildVideos, urlset, xmlResponse } from "@/lib/sitemap";
import { tenantForHost } from "@/lib/storefront";

export const dynamic = "force-dynamic";

// /sitemaps/main.xml and /sitemaps/videos-<n>.xml
export async function GET(_req: Request, { params }: { params: Promise<{ host: string; part: string }> }) {
  const { host, part } = await params;
  const tenant = await tenantForHost(host);
  if (!tenant) return new Response("Not found", { status: 404 });
  const origin = await canonicalOrigin(tenant);
  if (part === "main.xml") return xmlResponse(urlset(await buildMain(tenant, origin)));
  const m = /^videos-(\d{1,4})\.xml$/.exec(part);
  if (!m) return new Response("Not found", { status: 404 });
  return xmlResponse(urlset(await buildVideos(tenant, origin, Number(m[1]))));
}
