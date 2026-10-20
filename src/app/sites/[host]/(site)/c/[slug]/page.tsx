import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import { tenantDb } from "@/lib/db/client";
import { findCategoryByRef, videoPath } from "@/lib/handles";
import { autoDescription, parsePageSeo, parseSiteSeo } from "@/lib/seo";
import { absoluteUrl, buildPageMetadata, canonicalOrigin } from "@/lib/seo-server";
import { toStoreVideo } from "@/lib/storefront-data";
import { ageGateBlocks, tenantForHost } from "@/lib/storefront";
import { parseFeatures } from "@/lib/theme";
import { getTemplate } from "@/templates/registry";

export const dynamic = "force-dynamic";

async function load(host: string, slug: string) {
  const tenant = await tenantForHost(host);
  if (!tenant || !parseFeatures(tenant.features).categories) return null;
  const db = tenantDb(tenant.id);
  const hit = await findCategoryByRef<any>(db, slug);
  return hit ? { tenant, db, category: hit.category, redirect: hit.redirect } : null;
}

export async function generateMetadata({ params }: { params: Promise<{ host: string; slug: string }> }): Promise<Metadata> {
  const { host, slug } = await params;
  const d = await load(host, slug);
  if (!d || (await ageGateBlocks(d.tenant))) return {};
  const cseo = parsePageSeo(d.category.seo);
  return buildPageMetadata({
    tenant: d.tenant, siteSeo: parseSiteSeo(d.tenant.seo), origin: await canonicalOrigin(d.tenant), path: `/c/${d.category.slug}`,
    title: cseo.title || d.category.name,
    description: cseo.description || autoDescription(null, `Browse ${d.category.name} videos on ${d.tenant.name}.`),
    keywords: [d.category.name, ...cseo.keywords], image: cseo.ogImage, noindex: cseo.noindex, canonicalUrl: cseo.canonicalUrl,
  });
}

export default async function CategoryPage({ params }: { params: Promise<{ host: string; slug: string }> }) {
  const { host, slug } = await params;
  const d = await load(host, slug);
  if (!d) notFound();
  if (d.redirect) permanentRedirect(`/c/${d.category.slug}`); // retired handle -> current URL (308)
  if (await ageGateBlocks(d.tenant)) return null;
  const { tenant, db, category } = d;
  const origin = await canonicalOrigin(tenant);
  const cseo = parsePageSeo(category.seo);
  const videos = await db.video.findMany({
    where: { categoryId: category.id, status: "READY", visibility: "PUBLIC" },
    orderBy: { createdAt: "desc" }, take: 48, include: { category: { select: { name: true } } },
  });
  const T = getTemplate(tenant.templateId);
  const crumbs = [{ name: "Home", href: "/" }, { name: category.name, href: `/c/${category.slug}` }];
  return (
    <>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org", "@type": "CollectionPage", name: cseo.title || category.name, url: `${origin}/c/${category.slug}`,
            description: cseo.description || undefined,
            mainEntity: { "@type": "ItemList", itemListElement: videos.slice(0, 20).map((v, i) => ({ "@type": "ListItem", position: i + 1, url: `${origin}${videoPath(v)}`, name: v.title })) },
          },
          { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${origin}${c.href}` })) },
        ]}
      />
      <T.Listing heading={cseo.title || category.name} intro={cseo.description} breadcrumbs={crumbs} videos={videos.map(toStoreVideo)} emptyText="No videos in this category yet." />
    </>
  );
}
