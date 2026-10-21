"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import SeoPanel from "@/components/seo/SeoPanel";
import type { ListingValue } from "@/components/seo/SearchListing";
import { Card } from "@/components/ui";

/** The home page's search listing (title + description live in the site-wide SEO record) plus the site-wide visibility switch. */
export default function HomeSeo({ tenantId, slug, origin, siteName, homeTitle, homeDescription, noindex, canEdit }: { tenantId: string; slug: string; origin: string; siteName: string; homeTitle: string; homeDescription: string; noindex: boolean; canEdit: boolean }) {
  const router = useRouter();
  const [hidden, setHidden] = useState(noindex);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const initial: ListingValue = { title: homeTitle, description: homeDescription, handle: "", keywords: "", ogImage: "", canonicalUrl: "", noindex: hidden, extraMeta: "", jsonLd: "" };

  async function toggle(next: boolean) {
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/sites/${tenantId}/features`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ noindex: next }) }).catch(() => null);
    setBusy(false);
    if (res?.ok) { setHidden(next); router.refresh(); } else setErr("Could not change this setting.");
  }

  return (
    <Card title="Home page">
      <SeoPanel
        initial={initial}
        endpoint={`/api/sites/${tenantId}/seo`}
        toBody={(v) => ({ homeTitle: v.title, homeDescription: v.description })}
        origin={origin} pathPrefix="" simple handleEditable={false}
        fallbackTitle={siteName} fallbackDescription={`Watch videos on ${siteName}`} siteName={siteName}
      />
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input type="checkbox" checked={hidden} disabled={!canEdit || busy} onChange={(e) => void toggle(e.target.checked)} className="mt-1" />
        <span><strong>Hide the whole site from search engines (noindex).</strong> <span className="text-neutral-600">Turn this on while you build the site; turn it off to launch. More visibility options are in <a className="underline" href={`/dashboard/${slug}/settings`}>Settings → Features</a>.</span></span>
      </label>
      {err && <p role="alert" className="mt-1 text-sm text-red-700">{err}</p>}
    </Card>
  );
}
