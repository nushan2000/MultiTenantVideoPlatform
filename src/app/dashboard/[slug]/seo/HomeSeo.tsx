"use client";

import SeoPanel from "@/components/seo/SeoPanel";
import type { ListingValue } from "@/components/seo/SearchListing";
import { Card } from "@/components/ui";

/** The home page's search listing (title + description live in the site-wide SEO record). */
export default function HomeSeo({ tenantId, origin, siteName, homeTitle, homeDescription, noindex }: { tenantId: string; origin: string; siteName: string; homeTitle: string; homeDescription: string; noindex: boolean }) {
  const initial: ListingValue = { title: homeTitle, description: homeDescription, handle: "", keywords: "", ogImage: "", canonicalUrl: "", noindex, extraMeta: "", jsonLd: "" };
  return (
    <Card title="Home page">
      <SeoPanel
        initial={initial}
        endpoint={`/api/sites/${tenantId}/seo`}
        toBody={(v) => ({ homeTitle: v.title, homeDescription: v.description })}
        origin={origin} pathPrefix="" simple handleEditable={false}
        fallbackTitle={siteName} fallbackDescription={`Watch videos on ${siteName}`} siteName={siteName}
      />
      <p className="mt-2 text-xs text-neutral-500">To hide the whole site from search engines use Settings → Features → noindex.</p>
    </Card>
  );
}
