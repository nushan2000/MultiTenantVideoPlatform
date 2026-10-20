import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import PaginationHead from "@/components/PaginationHead";
import { PAGE_SIZE, pageHref, parsePage, totalPagesOf } from "@/lib/pagination";
import { parseProfile } from "@/lib/pages/profile";
import { parseJsonLd, parseSiteSeo } from "@/lib/seo";
import { absoluteUrl, buildPageMetadata, canonicalOrigin } from "@/lib/seo-server";
import { categoryChips, homeData } from "@/lib/storefront-data";
import { ageGateBlocks, tenantForHost } from "@/lib/storefront";
import { parseFeatures } from "@/lib/theme";
import { getTemplate } from "@/templates/registry";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ host: string }>; searchParams: Promise<{ page?: string }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const t = await tenantForHost((await params).host);
  if (!t || (await ageGateBlocks(t))) return {};
  const seo = parseSiteSeo(t.seo);
  const page = parsePage((await searchParams).page);
  const { total } = await homeData(t, page);
  return buildPageMetadata({
    tenant: t, siteSeo: seo, origin: await canonicalOrigin(t), path: "/", absoluteTitle: true,
    title: seo.homeTitle || t.name,
    description: seo.homeDescription || `Watch videos on ${t.name}`,
    pagination: { page, totalPages: totalPagesOf(total, PAGE_SIZE) },
    extraMeta: seo.extraMeta,
  });
}

export default async function Home({ params, searchParams }: Props) {
  const tenant = await tenantForHost((await params).host);
  if (!tenant) notFound();
  if (await ageGateBlocks(tenant)) return null;
  const page = parsePage((await searchParams).page);
  const seo = parseSiteSeo(tenant.seo);
  const profile = parseProfile(tenant.profile);
  const features = parseFeatures(tenant.features);
  const origin = await canonicalOrigin(tenant);
  const T = getTemplate(tenant.templateId);
  const [data, chips] = await Promise.all([homeData(tenant, page), features.categories ? categoryChips(tenant) : Promise.resolve([])]);
  const totalPages = totalPagesOf(data.total);
  if (page > totalPages && page > 1) notFound();
  const orgName = seo.organizationName || tenant.name;

  return (
    <>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org", "@type": "WebSite", name: tenant.name, url: `${origin}/`, inLanguage: (seo.locale ?? "en").replace("_", "-"),
            ...(features.search ? { potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${origin}/search?q={search_term_string}` }, "query-input": "required name=search_term_string" } } : {}),
          },
          {
            "@context": "https://schema.org", "@type": "Organization", name: orgName, url: `${origin}/`, logo: absoluteUrl(origin, tenant.logoUrl),
            sameAs: seo.socials.length ? seo.socials : undefined,
            contactPoint: profile.contactEmail ? { "@type": "ContactPoint", contactType: "customer support", email: profile.contactEmail } : undefined,
          },
          ...parseJsonLd(seo.jsonLd),
        ]}
      />
      <PaginationHead origin={origin} path="/" page={page} totalPages={totalPages} />
      <T.Home
        heading={seo.homeTitle || tenant.name} intro={seo.homeDescription} chips={chips} features={features}
        featured={data.featured} latest={data.latest}
        pagination={{ page, totalPages, hrefFor: (n) => pageHref("/", n) }}
      />
    </>
  );
}
