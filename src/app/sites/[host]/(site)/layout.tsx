import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import AgeGate from "@/components/AgeGate";
import { AGE_COOKIE } from "@/lib/age-cookie";
import { tenantDb } from "@/lib/db/client";
import { entitlements } from "@/lib/entitlements";
import { parseSiteSeo } from "@/lib/seo";
import { absoluteUrl, canonicalOrigin, INDEXABLE_ROBOTS } from "@/lib/seo-server";
import { adsForTenant } from "@/lib/storefront-data";
import { tenantForHost } from "@/lib/storefront";
import { parseFeatures, parseTheme } from "@/lib/theme";
import { getTemplate } from "@/templates/registry";

export const dynamic = "force-dynamic";

// Adult sites carry the RTA label so parental-control software can filter them.
const RTA = "RTA-5042-1996-1400-1577-RTA";

/** Site-wide defaults. Pages add their own title/description/canonical/OG on top (see buildPageMetadata). */
export async function generateMetadata({ params }: { params: Promise<{ host: string }> }): Promise<Metadata> {
  const t = await tenantForHost((await params).host);
  if (!t) return {};
  const f = parseFeatures(t.features);
  const seo = parseSiteSeo(t.seo);
  const origin = await canonicalOrigin(t);
  const image = absoluteUrl(origin, seo.ogImage) ?? absoluteUrl(origin, t.logoUrl);
  const handle = seo.twitterHandle ? (seo.twitterHandle.startsWith("@") ? seo.twitterHandle : `@${seo.twitterHandle}`) : undefined;
  const description = seo.homeDescription || `Watch videos on ${t.name}`;

  return {
    metadataBase: new URL(origin),
    title: { default: seo.homeTitle || t.name, template: seo.titleTemplate || `%s · ${t.name}` },
    description,
    keywords: seo.keywords.length ? seo.keywords : undefined,
    applicationName: t.name,
    generator: undefined,
    robots: f.noindex ? { index: false, follow: false } : INDEXABLE_ROBOTS,
    openGraph: { type: "website", siteName: t.name, locale: (seo.locale ?? "en").replace("-", "_"), title: seo.homeTitle || t.name, description, images: image ? [{ url: image }] : undefined },
    twitter: { card: image ? "summary_large_image" : "summary", site: handle, images: image ? [image] : undefined },
    verification: { google: seo.googleVerification, other: seo.bingVerification ? { "msvalidate.01": seo.bingVerification } : undefined },
    icons: t.faviconUrl ? { icon: t.faviconUrl } : undefined,
    other: t.contentCategory === "ADULT" ? { rating: RTA, RATING: RTA } : undefined,
  };
}

export default async function SiteLayout({ children, params }: { children: ReactNode; params: Promise<{ host: string }> }) {
  const tenant = await tenantForHost((await params).host);
  if (!tenant) notFound();

  const theme = parseTheme(tenant.theme);
  const features = parseFeatures(tenant.features);
  const lang = (parseSiteSeo(tenant.seo).locale ?? "en").replace("_", "-");
  const ent = entitlements(tenant.planKey);
  const T = getTemplate(tenant.templateId);
  const shellBase = { tenant: { name: tenant.name, logoUrl: tenant.logoUrl }, theme, features, categories: [], showBadge: !ent.canRemoveBadge, allowCustomCss: ent.canUseCustomCss, lang };

  // Age gate: always for adult sites, optional otherwise. Consent is a host-scoped cookie.
  const gated = tenant.contentCategory === "ADULT" || features.ageGate;
  if (gated && !(await cookies()).get(AGE_COOKIE)) {
    return <T.Shell {...shellBase} bare><AgeGate siteName={tenant.name} /></T.Shell>;
  }

  const [categories, ads] = await Promise.all([
    features.categories ? tenantDb(tenant.id).category.findMany({ orderBy: { name: "asc" }, select: { slug: true, name: true } }) : Promise.resolve([]),
    adsForTenant(tenant),
  ]);
  return (
    <T.Shell {...shellBase} categories={categories} banner={ads.bannerHtml}>
      {children}
    </T.Shell>
  );
}
