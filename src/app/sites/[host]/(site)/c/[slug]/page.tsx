import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import PaginationHead from "@/components/PaginationHead";
import { tenantDb } from "@/lib/db/client";
import { findCategoryByRef, videoPath } from "@/lib/handles";
import { pageHref, parsePage, totalPagesOf } from "@/lib/pagination";
import { autoDescription, parseJsonLd, parsePageSeo, parseSiteSeo } from "@/lib/seo";
import { absoluteUrl, buildPageMetadata, canonicalOrigin } from "@/lib/seo-server";
import { categoryChips, categoryVideos } from "@/lib/storefront-data";
import { ageGateBlocks, tenantForHost } from "@/lib/storefront";
import { parseFeatures } from "@/lib/theme";
import { getTemplate } from "@/templates/registry";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ host: string; slug: string }>; searchParams: Promise<{ page?: string }> };

async function load(host: string, slug: string) {
  const tenant = await tenantForHost(host);
  if (!tenant || !parseFeatures(tenant.features).categories) return null;
  const hit = await findCategoryByRef<any>(tenantDb(tenant.id), slug);
  return hit ? { tenant, category: hit.category, redirect: hit.redirect } : null;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { host, slug } = await params;
  const d = await load(host, slug);
  if (!d || (await ageGateBlocks(d.tenant))) return {};
  const cseo = parsePageSeo(d.category.seo);
  const page = parsePage((await searchParams).page);
  const { total } = await categoryVideos(d.tenant, d.category.id, page);
  return buildPageMetadata({
    tenant: d.tenant, siteSeo: parseSiteSeo(d.tenant.seo), origin: await canonicalOrigin(d.tenant), path: `/c/${d.category.slug}`,
    title: cseo.title || d.category.name,
    description: cseo.description || autoDescription(null, `Browse ${d.category.name} videos on ${d.tenant.name}.`),
    keywords: [d.category.name, ...cseo.keywords], image: cseo.ogImage, noindex: cseo.noindex, canonicalUrl: cseo.canonicalUrl,
    pagination: { page, totalPages: totalPagesOf(total) }, extraMeta: cseo.extraMeta,
  });
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { host, slug } = await params;
  const d = await load(host, slug);
  if (!d) notFound();
  if (d.redirect) permanentRedirect(`/c/${d.category.slug}`); // retired handle -> current URL (308)
  if (await ageGateBlocks(d.tenant)) return null;
  const { tenant, category } = d;
  const page = parsePage((await searchParams).page);
  const origin = await canonicalOrigin(tenant);
  const cseo = parsePageSeo(category.seo);
  const [{ videos, total }, chips] = await Promise.all([categoryVideos(tenant, category.id, page), categoryChips(tenant)]);
  const totalPages = totalPagesOf(total);
  if (page > totalPages && page > 1) notFound();
  const T = getTemplate(tenant.templateId);
  const base = `/c/${category.slug}`;
  const crumbs = [{ name: "Home", href: "/" }, { name: "Categories", href: "/categories" }, { name: category.name, href: base }];
  return (
    <>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org", "@type": "CollectionPage", name: cseo.title || category.name, url: `${origin}${base}`, description: cseo.description || undefined,
            mainEntity: { "@type": "ItemList", itemListElement: videos.slice(0, 20).map((v, i) => ({ "@type": "ListItem", position: i + 1, url: `${origin}${v.href}`, name: v.title, image: absoluteUrl(origin, v.thumbUrl) })) },
          },
          { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${origin}${c.href}` })) },
          ...parseJsonLd(cseo.jsonLd),
        ]}
      />
      <PaginationHead origin={origin} path={base} page={page} totalPages={totalPages} />
      <T.Listing heading={cseo.title || category.name} intro={cseo.description} breadcrumbs={crumbs} chips={chips} videos={videos} emptyText="No videos in this category yet." pagination={{ page, totalPages, hrefFor: (n) => pageHref(base, n) }} />
    </>
  );
}

void videoPath;
