import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import PaginationHead from "@/components/PaginationHead";
import { tagLabel, tagSlug } from "@/lib/media-meta";
import { pageHref, parsePage, totalPagesOf } from "@/lib/pagination";
import { parseSiteSeo } from "@/lib/seo";
import { buildPageMetadata, canonicalOrigin } from "@/lib/seo-server";
import { tagData } from "@/lib/storefront-data";
import { ageGateBlocks, tenantForHost } from "@/lib/storefront";
import { getTemplate } from "@/templates/registry";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ host: string; tag: string }>; searchParams: Promise<{ page?: string }> };

async function load(host: string, tag: string, pageParam: string | undefined) {
  const tenant = await tenantForHost(host);
  if (!tenant || tagSlug(tag) !== tag) return null; // only canonical tag slugs exist
  const page = parsePage(pageParam);
  const data = await tagData(tenant, tag, page);
  return data.total === 0 ? null : { tenant, page, ...data };
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { host, tag } = await params;
  const d = await load(host, tag, (await searchParams).page);
  if (!d || (await ageGateBlocks(d.tenant))) return {};
  const label = tagLabel(tag);
  return buildPageMetadata({
    tenant: d.tenant, siteSeo: parseSiteSeo(d.tenant.seo), origin: await canonicalOrigin(d.tenant), path: `/tag/${tag}`,
    title: `${label[0].toUpperCase()}${label.slice(1)} videos`, description: `Watch ${d.total} ${label} video${d.total === 1 ? "" : "s"} on ${d.tenant.name}.`,
    keywords: [label], pagination: { page: d.page, totalPages: totalPagesOf(d.total) },
    noindex: d.total < 2, // a tag page with a single video is thin content: keep it out of the index (links are still followed)
  });
}

export default async function TagPage({ params, searchParams }: Props) {
  const { host, tag } = await params;
  const d = await load(host, tag, (await searchParams).page);
  if (!d) notFound();
  if (await ageGateBlocks(d.tenant)) return null;
  const totalPages = totalPagesOf(d.total);
  if (d.page > totalPages && d.page > 1) notFound();
  const origin = await canonicalOrigin(d.tenant);
  const T = getTemplate(d.tenant.templateId);
  const label = tagLabel(tag);
  const crumbs = [{ name: "Home", href: "/" }, { name: `#${label}`, href: `/tag/${tag}` }];
  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${origin}${c.href}` })) }} />
      <PaginationHead origin={origin} path={`/tag/${tag}`} page={d.page} totalPages={totalPages} />
      <T.Listing heading={`#${label}`} intro={`${d.total} video${d.total === 1 ? "" : "s"} tagged ${label}.`} breadcrumbs={crumbs} videos={d.videos} emptyText="No videos." pagination={{ page: d.page, totalPages, hrefFor: (n) => pageHref(`/tag/${tag}`, n) }} />
    </>
  );
}
