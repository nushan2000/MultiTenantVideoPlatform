import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import PaginationHead from "@/components/PaginationHead";
import { pageHref, parsePage, totalPagesOf } from "@/lib/pagination";
import { parseSiteSeo } from "@/lib/seo";
import { buildPageMetadata, canonicalOrigin } from "@/lib/seo-server";
import { trendingData } from "@/lib/storefront-data";
import { ageGateBlocks, tenantForHost } from "@/lib/storefront";
import { getTemplate } from "@/templates/registry";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ host: string }>; searchParams: Promise<{ page?: string }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const t = await tenantForHost((await params).host);
  if (!t || (await ageGateBlocks(t))) return {};
  const page = parsePage((await searchParams).page);
  const { total } = await trendingData(t, page);
  return buildPageMetadata({
    tenant: t, siteSeo: parseSiteSeo(t.seo), origin: await canonicalOrigin(t), path: "/trending", title: "Trending videos",
    description: `The most watched videos on ${t.name}. See what everyone is watching right now.`, pagination: { page, totalPages: totalPagesOf(total) },
  });
}

export default async function Trending({ params, searchParams }: Props) {
  const tenant = await tenantForHost((await params).host);
  if (!tenant) notFound();
  if (await ageGateBlocks(tenant)) return null;
  const page = parsePage((await searchParams).page);
  const { videos, total } = await trendingData(tenant, page);
  const totalPages = totalPagesOf(total);
  if (page > totalPages && page > 1) notFound();
  const origin = await canonicalOrigin(tenant);
  const T = getTemplate(tenant.templateId);
  const crumbs = [{ name: "Home", href: "/" }, { name: "Trending", href: "/trending" }];
  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${origin}${c.href}` })) }} />
      <PaginationHead origin={origin} path="/trending" page={page} totalPages={totalPages} />
      <T.Listing heading="Trending videos" intro={`The most watched videos on ${tenant.name}.`} breadcrumbs={crumbs} videos={videos} emptyText="No videos yet." pagination={{ page, totalPages, hrefFor: (n) => pageHref("/trending", n) }} />
    </>
  );
}
