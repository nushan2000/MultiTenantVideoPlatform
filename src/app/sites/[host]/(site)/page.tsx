import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import { parseSiteSeo } from "@/lib/seo";
import { absoluteUrl, buildPageMetadata, canonicalOrigin } from "@/lib/seo-server";
import { homeData } from "@/lib/storefront-data";
import { ageGateBlocks, tenantForHost } from "@/lib/storefront";
import { parseFeatures } from "@/lib/theme";
import { getTemplate } from "@/templates/registry";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ host: string }> }): Promise<Metadata> {
  const t = await tenantForHost((await params).host);
  if (!t || (await ageGateBlocks(t))) return {};
  const seo = parseSiteSeo(t.seo);
  return buildPageMetadata({
    tenant: t, siteSeo: seo, origin: await canonicalOrigin(t), path: "/", absoluteTitle: true,
    title: seo.homeTitle || t.name,
    description: seo.homeDescription || `Watch videos on ${t.name}`,
  });
}

export default async function Home({ params }: { params: Promise<{ host: string }> }) {
  const tenant = await tenantForHost((await params).host);
  if (!tenant) notFound();
  if (await ageGateBlocks(tenant)) return null;
  const seo = parseSiteSeo(tenant.seo);
  const features = parseFeatures(tenant.features);
  const origin = await canonicalOrigin(tenant);
  const T = getTemplate(tenant.templateId);
  const data = await homeData(tenant);
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
            "@context": "https://schema.org", "@type": "Organization", name: orgName, url: `${origin}/`,
            logo: absoluteUrl(origin, tenant.logoUrl), sameAs: seo.socials.length ? seo.socials : undefined,
          },
        ]}
      />
      <T.Home heading={seo.homeTitle || tenant.name} intro={seo.homeDescription} features={features} {...data} />
    </>
  );
}
