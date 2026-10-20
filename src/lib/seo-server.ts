import { cache } from "react";
import { platformDb } from "./db/client";
import { entitlements } from "./entitlements";
import type { ResolvedTenant } from "./tenancy/resolve";
import { siteOrigin } from "./storefront-data";
import type { Metadata } from "next";
import type { SiteSeo } from "./seo";
import { parseFeatures } from "./theme";

/**
 * The one canonical origin for a tenant's pages. A Premium tenant with an ACTIVE custom domain is canonical on that
 * domain, so its free subdomain doesn't compete with it (duplicate content). Otherwise: the origin being served.
 */
export const canonicalOrigin = cache(async (t: ResolvedTenant): Promise<string> => {
  if (entitlements(t.planKey).canUseCustomDomain) {
    const d = await platformDb.customDomain.findFirst({ where: { tenantId: t.id, status: "ACTIVE" }, select: { hostname: true } });
    if (d) return `https://${d.hostname}`;
  }
  return siteOrigin();
});

/** Make a stored image reference absolute ("/api/media/…" or https URL). */
export const absoluteUrl = (origin: string, ref: string | null | undefined): string | undefined =>
  !ref ? undefined : ref.startsWith("https://") ? ref : ref.startsWith("/") ? `${origin}${ref}` : undefined;

/** ISO-8601 duration for schema.org (PT1H2M3S). */
export function isoDuration(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `PT${h ? `${h}H` : ""}${m ? `${m}M` : ""}${s || (!h && !m) ? `${s}S` : ""}`;
}

// ---------------------------------------------------------------------------------- metadata builder

/** Explicit directives for indexable pages: allow large image + unlimited video/text previews in results. */
export const INDEXABLE_ROBOTS: NonNullable<Metadata["robots"]> = {
  index: true, follow: true,
  googleBot: { index: true, follow: true, "max-video-preview": -1, "max-image-preview": "large", "max-snippet": -1 },
};
export const NOINDEX_ROBOTS: NonNullable<Metadata["robots"]> = { index: false, follow: true };

/**
 * Next replaces (not deep-merges) nested objects like openGraph/twitter between layout and page, so every page builds the
 * full set itself through this helper: one place that guarantees canonical + OG + Twitter + robots are always consistent.
 */
export function buildPageMetadata(a: {
  tenant: ResolvedTenant;
  siteSeo: SiteSeo;
  origin: string;
  path: string; // "/", "/c/foo", "/v/123"
  title: string; // page title WITHOUT the site template
  absoluteTitle?: boolean; // true: don't apply the site title template (home page)
  description: string;
  keywords?: string[];
  image?: string | null; // stored ref or absolute URL
  noindex?: boolean;
  canonicalUrl?: string; // explicit override
  ogType?: "website" | "video.other" | "article";
}): Metadata {
  const { tenant: t, siteSeo: s, origin } = a;
  const siteNoindex = parseFeatures(t.features).noindex;
  const url = a.canonicalUrl || `${origin}${a.path}`;
  const image = absoluteUrl(origin, a.image) ?? absoluteUrl(origin, s.ogImage) ?? absoluteUrl(origin, t.logoUrl);
  const handle = s.twitterHandle ? (s.twitterHandle.startsWith("@") ? s.twitterHandle : `@${s.twitterHandle}`) : undefined;
  const keywords = [...(a.keywords ?? []), ...s.keywords];
  return {
    title: a.absoluteTitle ? { absolute: a.title } : a.title,
    description: a.description,
    keywords: keywords.length ? [...new Set(keywords)].slice(0, 20) : undefined,
    alternates: { canonical: url },
    // always explicit: an `undefined` here would ERASE the layout default instead of inheriting it
    // a site-wide noindex always wins over a page-level "indexable"
    robots: siteNoindex ? { index: false, follow: false } : a.noindex ? NOINDEX_ROBOTS : INDEXABLE_ROBOTS,
    openGraph: {
      type: a.ogType ?? "website",
      siteName: t.name,
      locale: (s.locale ?? "en").replace("-", "_"),
      url,
      title: a.title,
      description: a.description,
      images: image ? [{ url: image, alt: a.title }] : undefined,
    },
    twitter: { card: image ? "summary_large_image" : "summary", site: handle, title: a.title, description: a.description, images: image ? [image] : undefined },
  };
}

/** Public origin for dashboard display (no request context): active custom domain, else the free subdomain. */
export async function tenantPublicOrigin(t: { id: string; slug: string; planKey: string }): Promise<{ origin: string; custom: boolean }> {
  if (entitlements(t.planKey).canUseCustomDomain) {
    const d = await platformDb.customDomain.findFirst({ where: { tenantId: t.id, status: "ACTIVE" }, select: { hostname: true } });
    if (d) return { origin: `https://${d.hostname}`, custom: true };
  }
  const { siteUrl } = await import("./site-url");
  return { origin: siteUrl(t.slug), custom: false };
}
