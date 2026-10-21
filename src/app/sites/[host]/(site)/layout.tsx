import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import type { ReactNode } from "react";
import AgeGate from "@/components/AgeGate";
import { tenantDb } from "@/lib/db/client";
import { entitlements } from "@/lib/entitlements";
import { footerGroups, navLinksFor } from "@/lib/pages/store";
import { SYSTEM_PAGES } from "@/lib/pages/system";
import { publicPlaylists } from "@/lib/playlists";
import { parseSiteSeo } from "@/lib/seo";
import { absoluteUrl, canonicalOrigin, INDEXABLE_ROBOTS } from "@/lib/seo-server";
import { adsForTenant } from "@/lib/storefront-data";
import { ageGateBlocks, pagesForTenant, tenantForHost } from "@/lib/storefront";
import { parseFeatures, parseTheme } from "@/lib/theme";
import { getTemplate } from "@/templates/registry";

export const dynamic = "force-dynamic";

// Adult sites carry the RTA label so parental-control software can filter them.
const RTA = "RTA-5042-1996-1400-1577-RTA";

export async function generateViewport({ params }: { params: Promise<{ host: string }> }): Promise<Viewport> {
  const t = await tenantForHost((await params).host);
  return { width: "device-width", initialScale: 1, themeColor: t ? parseTheme(t.theme).primaryColor : undefined };
}

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
  const icon = t.faviconUrl ?? t.logoUrl;
  const extra: Record<string, string> = Object.fromEntries(seo.extraMeta.map((m) => [m.name, m.content]));

  return {
    metadataBase: new URL(origin),
    title: { default: seo.homeTitle || t.name, template: seo.titleTemplate || `%s · ${t.name}` },
    description,
    keywords: seo.keywords.length ? seo.keywords : undefined,
    applicationName: t.name,
    robots: f.noindex ? { index: false, follow: false } : INDEXABLE_ROBOTS,
    openGraph: { type: "website", siteName: t.name, locale: (seo.locale ?? "en").replace("-", "_"), title: seo.homeTitle || t.name, description, images: image ? [{ url: image }] : undefined },
    twitter: { card: image ? "summary_large_image" : "summary", site: handle, images: image ? [image] : undefined },
    verification: { google: seo.googleVerification, other: seo.bingVerification ? { "msvalidate.01": seo.bingVerification } : undefined },
    icons: icon ? { icon, apple: icon } : undefined,
    manifest: "/manifest.webmanifest",
    alternates: { types: { "application/rss+xml": [{ url: "/feed.xml", title: `${t.name} videos` }] } },
    other: { ...extra, ...(t.contentCategory === "ADULT" ? { rating: RTA, RATING: RTA } : {}) },
  };
}

export default async function SiteLayout({ children, params }: { children: ReactNode; params: Promise<{ host: string }> }) {
  const tenant = await tenantForHost((await params).host);
  if (!tenant) notFound();

  // Premium tenant with an ACTIVE custom domain: its free subdomain 301-redirects there (one canonical address, no duplicate content).
  const h = await headers();
  const origin = await canonicalOrigin(tenant);
  const reqHost = (h.get("x-tenant-host") ?? "").toLowerCase();
  if (reqHost && new URL(origin).hostname !== reqHost) permanentRedirect(`${origin}${h.get("x-site-url") ?? "/"}`);

  const theme = parseTheme(tenant.theme);
  const features = parseFeatures(tenant.features);
  const lang = (parseSiteSeo(tenant.seo).locale ?? "en").replace("_", "-");
  const ent = entitlements(tenant.planKey);
  const T = getTemplate(tenant.templateId);
  const base = { tenant: { name: tenant.name, logoUrl: tenant.logoUrl }, theme, features, categories: [], navLinks: [], footer: [], showBadge: !ent.canRemoveBadge, allowCustomCss: ent.canUseCustomCss, lang };

  // Age gate (verified search crawlers are let through when the owner allows it; see ageGateBlocks).
  // Legal/help pages (privacy, terms, DMCA, 2257, contact...) contain no adult content and must be readable BEFORE the gate.
  const path = (h.get("x-site-url") ?? "/").split("?")[0].replace(/^\//, "");
  const exempt = SYSTEM_PAGES.some((p) => p.slug === path);
  if (!exempt && (await ageGateBlocks(tenant))) {
    return <T.Shell {...base} bare><AgeGate siteName={tenant.name} /></T.Shell>;
  }

  const [categories, ads, pages, playlists] = await Promise.all([
    features.categories ? tenantDb(tenant.id).category.findMany({ orderBy: { name: "asc" }, select: { slug: true, name: true } }) : Promise.resolve([]),
    adsForTenant(tenant),
    pagesForTenant(tenant),
    publicPlaylists(tenant.id, 4),
  ]);
  const hasCategories = features.categories && categories.length > 0;
  const navLinks = navLinksFor(pages, { hasCategories });
  return (
    <T.Shell {...base} categories={categories} navLinks={navLinks} footer={footerGroups(pages, { hasCategories, playlists })} banner={ads.bannerHtml}>
      {children}
    </T.Shell>
  );
}
