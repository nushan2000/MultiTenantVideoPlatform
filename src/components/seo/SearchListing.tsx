"use client";

import { useState } from "react";
import { inputCls } from "@/components/ui";
import { analyzeDescription, analyzeTitle, applyTitleTemplate, slugifyHandle, truncate } from "@/lib/seo";

export type ListingValue = {
  title: string;
  description: string;
  handle: string;
  keywords: string;
  ogImage: string;
  canonicalUrl: string;
  noindex: boolean;
  /** one per line: "name: content" */
  extraMeta: string;
  /** custom schema.org JSON-LD (validated on save) */
  jsonLd: string;
};

type StoredSeo = { title?: string; description?: string; handle?: string; keywords?: string[]; ogImage?: string; canonicalUrl?: string; noindex?: boolean; extraMeta?: { name: string; content: string }[]; jsonLd?: string };

export const toListingValue = (s: StoredSeo | undefined | null, handleOverride?: string): ListingValue => ({
  title: s?.title ?? "",
  description: s?.description ?? "",
  handle: handleOverride ?? s?.handle ?? "",
  keywords: (s?.keywords ?? []).join(", "),
  ogImage: s?.ogImage ?? "",
  canonicalUrl: s?.canonicalUrl ?? "",
  noindex: s?.noindex ?? false,
  extraMeta: (s?.extraMeta ?? []).map((m) => `${m.name}: ${m.content}`).join("\n"),
  jsonLd: s?.jsonLd ?? "",
});

export const listingBody = (v: ListingValue) => ({
  title: v.title, description: v.description, handle: v.handle, keywords: v.keywords,
  ogImage: v.ogImage, canonicalUrl: v.canonicalUrl, noindex: v.noindex, jsonLd: v.jsonLd,
  extraMeta: v.extraMeta.split(/\r?\n/).map((l) => /^\s*([^:\s]+)\s*:\s*(.+?)\s*$/.exec(l)).filter((m): m is RegExpExecArray => !!m).map((m) => ({ name: m[1], content: m[2] })),
});

const COLOR = { good: "text-green-700", warn: "text-amber-700", bad: "text-red-700" } as const;

export type ListingProps = {
  value: ListingValue;
  onChange: (v: ListingValue) => void;
  /** e.g. https://shop.example.com */
  origin: string;
  /** "/v/", "/c/" or "" for the home page (no handle). */
  pathPrefix: string;
  /** Handle shown when none is set (video id / category slug). */
  defaultHandle?: string;
  /** The saved handle: used to warn that changing it creates a redirect. */
  savedHandle?: string;
  handleEditable?: boolean;
  fallbackTitle: string;
  fallbackDescription: string;
  siteName: string;
  template?: string;
  applyTemplate?: boolean;
  /** Start expanded (deep links from the SEO hub / the videos list). */
  defaultOpen?: boolean;
  /** Hide the share-image / canonical / keywords block (home uses site-wide settings instead). */
  simple?: boolean;
  titleLabel?: string;
  /** Image for the social-card preview (thumbnail / share image). */
  socialImage?: string;
};

/**
 * Shopify-style "Search engine listing": a live Google-result preview, collapsed by default, with an
 * "Edit website SEO" button that reveals page title, meta description and URL handle (+ advanced options).
 * Fully controlled and client-side: the parent decides when/how to save.
 */
export default function SearchListing(p: ListingProps) {
  const [open, setOpen] = useState(!!p.defaultOpen);
  const v = p.value;
  const set = (patch: Partial<ListingValue>) => p.onChange({ ...v, ...patch });

  const shownTitle = v.title || p.fallbackTitle;
  const shownDesc = v.description || p.fallbackDescription;
  const fullTitle = p.applyTemplate ? applyTitleTemplate(p.template, shownTitle, p.siteName) : shownTitle;
  const host = p.origin.replace(/^https?:\/\//, "");
  const handle = v.handle || p.defaultHandle || "";
  const crumb = p.pathPrefix ? `${host} › ${p.pathPrefix.split("/").join("")}${handle ? ` › ${handle}` : ""}` : host;
  const th = analyzeTitle(shownTitle);
  const dh = analyzeDescription(shownDesc);
  const handleChanged = !!p.handleEditable && (v.handle || "") !== (p.savedHandle ?? "") && !!(p.savedHandle || p.defaultHandle);

  return (
    <section className="rounded-lg border border-neutral-200 bg-white" aria-label="Search engine listing">
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <h3 className="mb-2 text-sm font-semibold">Search engine listing</h3>
          <div className="truncate text-xs text-green-800">{crumb}</div>
          <div className="truncate text-lg leading-snug text-blue-700">{truncate(fullTitle, 60)}</div>
          <div className="text-sm text-neutral-600">{truncate(shownDesc, 160)}</div>
          {v.noindex && <div className="mt-1 text-xs font-medium text-red-700">Hidden from search engines (noindex)</div>}
          {open && (
            <div className="mt-3 max-w-sm overflow-hidden rounded-md border border-neutral-200" aria-label="Social share preview">
              <div className="aspect-[1.91/1] bg-neutral-200">{(v.ogImage || p.socialImage) ? <img src={v.ogImage || p.socialImage} alt="" className="h-full w-full object-cover" /> : null}</div>
              <div className="bg-neutral-50 p-2"><div className="text-xs uppercase text-neutral-500">{host}</div><div className="truncate text-sm font-semibold">{truncate(shownTitle, 70)}</div><div className="truncate text-xs text-neutral-600">{truncate(shownDesc, 90)}</div></div>
            </div>
          )}
        </div>
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
          className="shrink-0 rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">
          {open ? "Done" : "Edit website SEO"}
        </button>
      </div>

      {open && (
        <div className="border-t p-4">
          <label className="mb-3 block text-sm">
            <span className="mb-1 flex justify-between font-medium"><span>{p.titleLabel ?? "Page title"}</span><span className="text-xs font-normal text-neutral-500">{v.title.length} of 70 characters used</span></span>
            <input className={inputCls} value={v.title} maxLength={70} placeholder={p.fallbackTitle} onChange={(e) => set({ title: e.target.value })} />
            <span className={`mt-1 block text-xs ${v.title ? COLOR[th.level] : "text-neutral-500"}`}>{v.title ? th.message : `Empty: "${truncate(p.fallbackTitle, 60)}" is used automatically.`}</span>
          </label>

          <label className="mb-3 block text-sm">
            <span className="mb-1 flex justify-between font-medium"><span>Meta description</span><span className="text-xs font-normal text-neutral-500">{v.description.length} of 300 characters used</span></span>
            <textarea className={inputCls} rows={3} value={v.description} maxLength={300} placeholder={p.fallbackDescription} onChange={(e) => set({ description: e.target.value })} />
            <span className={`mt-1 block text-xs ${v.description ? COLOR[dh.level] : "text-neutral-500"}`}>{v.description ? dh.message : "Empty: an automatic description is used."}</span>
          </label>

          {p.handleEditable !== false && p.pathPrefix && (
            <div className="mb-3 text-sm">
              <div className="mb-1 flex items-center justify-between font-medium">
                <label htmlFor="seo-handle">URL handle</label>
                <button type="button" className="text-xs font-normal text-blue-700 underline" onClick={() => set({ handle: slugifyHandle(v.title || p.fallbackTitle) })}>Generate from title</button>
              </div>
              <div className="flex items-center overflow-hidden rounded-md border border-neutral-300 focus-within:border-blue-500">
                <span className="whitespace-nowrap bg-neutral-100 px-2 py-2 text-xs text-neutral-600">{host}{p.pathPrefix}</span>
                <input id="seo-handle" className="w-full px-2 py-2 text-sm focus:outline-none" value={v.handle} maxLength={80} placeholder={p.defaultHandle}
                  onChange={(e) => set({ handle: e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-{2,}/g, "-") })} />
              </div>
              {handleChanged && <p className="mt-1 text-xs text-amber-800">The old URL keeps working: visitors and search engines are redirected (308) to the new one automatically.</p>}
            </div>
          )}

          {!p.simple && (
            <details className="rounded-md border border-neutral-200 p-3 text-sm">
              <summary className="cursor-pointer font-medium">Advanced</summary>
              <div className="mt-3 grid gap-3">
                <label className="block"><span className="mb-1 block font-medium">Keywords (comma separated)</span>
                  <input className={inputCls} value={v.keywords} onChange={(e) => set({ keywords: e.target.value })} placeholder="tutorial, beginner, how to" /></label>
                <label className="block"><span className="mb-1 block font-medium">Social share image (https URL)</span>
                  <input className={inputCls} value={v.ogImage} onChange={(e) => set({ ogImage: e.target.value })} placeholder="Defaults to the thumbnail / site image" /></label>
                <label className="block"><span className="mb-1 block font-medium">Canonical URL</span>
                  <input className={inputCls} value={v.canonicalUrl} onChange={(e) => set({ canonicalUrl: e.target.value })} placeholder="Only if this content is a copy of a page elsewhere" /></label>
                <label className="block"><span className="mb-1 block font-medium">Custom meta tags (one per line, <code>name: content</code>)</span>
                  <textarea className={`${inputCls} font-mono text-xs`} rows={3} value={v.extraMeta} onChange={(e) => set({ extraMeta: e.target.value })} placeholder={"author: Jane Doe\npublisher: Acme Media"} /></label>
                <label className="block"><span className="mb-1 block font-medium">Custom structured data (JSON-LD)</span>
                  <textarea className={`${inputCls} font-mono text-xs`} rows={4} value={v.jsonLd} onChange={(e) => set({ jsonLd: e.target.value })} placeholder={'{"@context":"https://schema.org","@type":"Person","name":"Jane Doe"}'} />
                  <span className="mt-1 block text-xs text-neutral-500">Must be valid JSON with a schema.org context. It is added to this page as-is (scripts cannot run from it).</span></label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={v.noindex} onChange={(e) => set({ noindex: e.target.checked })} /> Hide this page from search engines (noindex)</label>
              </div>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
