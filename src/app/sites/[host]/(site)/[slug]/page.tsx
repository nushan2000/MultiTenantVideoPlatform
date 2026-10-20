import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import { markdownToText, renderMarkdown } from "@/lib/pages/markdown";
import { autoDescription, parseJsonLd, parseSiteSeo } from "@/lib/seo";
import { buildPageMetadata, canonicalOrigin } from "@/lib/seo-server";
import { ageGateBlocks, pagesForTenant, tenantForHost } from "@/lib/storefront";
import { getTemplate } from "@/templates/registry";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ host: string; slug: string }> };

async function load(host: string, slug: string) {
  const tenant = await tenantForHost(host);
  if (!tenant) return null;
  const page = (await pagesForTenant(tenant)).find((p) => p.slug === slug && p.published);
  return page ? { tenant, page } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { host, slug } = await params;
  const d = await load(host, slug);
  if (!d) return {};
  const { tenant, page } = d;
  // Custom pages are gated like the rest of the site; system pages (legal/help) are always reachable.
  if (page.custom && (await ageGateBlocks(tenant))) return {};
  return buildPageMetadata({
    tenant, siteSeo: parseSiteSeo(tenant.seo), origin: await canonicalOrigin(tenant), path: `/${slug}`,
    title: page.seo.title || page.title,
    description: page.description || autoDescription(markdownToText(page.markdown), `${page.title} on ${tenant.name}`),
    keywords: page.seo.keywords, image: page.seo.ogImage, noindex: page.seo.noindex, canonicalUrl: page.seo.canonicalUrl, extraMeta: page.seo.extraMeta,
  });
}

const TYPE: Record<string, string> = { about: "AboutPage", contact: "ContactPage", faq: "FAQPage" };

export default async function StorePage({ params }: Props) {
  const { host, slug } = await params;
  const d = await load(host, slug);
  if (!d) notFound();
  const { tenant, page } = d;
  if (page.custom && (await ageGateBlocks(tenant))) return null;
  const origin = await canonicalOrigin(tenant);
  const T = getTemplate(tenant.templateId);
  const crumbs = [{ name: "Home", href: "/" }, { name: page.title, href: `/${slug}` }];
  const html = renderMarkdown(page.markdown);
  return (
    <>
      <JsonLd
        data={[
          // FAQPage needs question/answer markup; AboutPage/ContactPage/WebPage are accurate for everything else
          { "@context": "https://schema.org", "@type": page.key && TYPE[page.key] && page.key !== "faq" ? TYPE[page.key] : "WebPage", name: page.seo.title || page.title, url: `${origin}/${slug}`, description: page.description || undefined, isPartOf: { "@type": "WebSite", name: tenant.name, url: `${origin}/` } },
          { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${origin}${c.href}` })) },
          ...parseJsonLd(page.seo.jsonLd),
        ]}
      />
      <T.Page title={page.title} html={html} breadcrumbs={crumbs} updated={page.updatedAt} />
    </>
  );
}
