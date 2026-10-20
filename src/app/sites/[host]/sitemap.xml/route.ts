import { canonicalOrigin } from "@/lib/seo-server";
import { buildIndex, xmlResponse } from "@/lib/sitemap";
import { tenantForHost } from "@/lib/storefront";

export const dynamic = "force-dynamic";

// /sitemap.xml is a sitemap INDEX (main + chunks of videos), so a tenant can grow past one file's limits.
// Only indexable content is listed; empty for sites that chose noindex. Absolute URLs use the canonical origin.
export async function GET(_req: Request, { params }: { params: Promise<{ host: string }> }) {
  const tenant = await tenantForHost((await params).host);
  if (!tenant) return new Response("Not found", { status: 404 });
  return xmlResponse(await buildIndex(tenant, await canonicalOrigin(tenant)));
}
