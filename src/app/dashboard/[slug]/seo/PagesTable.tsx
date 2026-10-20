"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import SeoPanel from "@/components/seo/SeoPanel";
import { listingBody, toListingValue } from "@/components/seo/SearchListing";
import { Card, btnGhostCls } from "@/components/ui";
import { truncate } from "@/lib/seo";

type Seo = { handle?: string; title?: string; description?: string; keywords?: string[]; ogImage?: string; canonicalUrl?: string; noindex?: boolean };
export type PageRow = {
  kind: "category" | "video";
  id: string;
  name: string;
  /** current URL handle (category slug / video handle or id) */
  ref: string;
  description: string;
  seo: Seo;
};

type Filter = "all" | "attention";
const tabCls = (on: boolean) => `rounded-full px-3 py-1 text-sm ${on ? "bg-blue-600 text-white" : "bg-neutral-200 hover:bg-neutral-300"}`;

/** Every page of the site in one list: see what's missing, expand a row to edit its search listing in place. */
export default function PagesTable({ rows: initial, origin, siteName, template, slug }: { rows: PageRow[]; origin: string; siteName: string; template: string; slug: string }) {
  const [rows, setRows] = useState(initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [kind, setKind] = useState<"all" | "category" | "video">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => setRows(initial), [initial]);

  // deep link: /dashboard/<slug>/seo#video-<id> or #category-<id>
  useEffect(() => {
    const h = window.location.hash.replace("#", "");
    const m = /^(video|category)-(.+)$/.exec(h);
    if (m) {
      setOpenId(m[2]);
      setTimeout(() => document.getElementById(h)?.scrollIntoView({ block: "center" }), 100);
    }
  }, []);

  const needs = (r: PageRow) => !r.seo.description && !r.description.trim() ? "Missing description" : !r.seo.title && r.kind === "category" ? "Using automatic title" : null;
  const shown = useMemo(
    () => rows.filter((r) => (kind === "all" || r.kind === kind) && (filter === "all" || !!needs(r))),
    [rows, filter, kind],
  );
  const attention = rows.filter((r) => needs(r)).length;

  return (
    <Card title={`Pages (${rows.length})`}>
      <div className="mb-3 flex flex-wrap gap-2">
        <button className={tabCls(filter === "all")} onClick={() => setFilter("all")}>All</button>
        <button className={tabCls(filter === "attention")} onClick={() => setFilter("attention")}>Needs attention ({attention})</button>
        <span className="mx-1 text-neutral-300">|</span>
        <button className={tabCls(kind === "all")} onClick={() => setKind("all")}>Everything</button>
        <button className={tabCls(kind === "category")} onClick={() => setKind("category")}>Categories</button>
        <button className={tabCls(kind === "video")} onClick={() => setKind("video")}>Videos</button>
      </div>
      {shown.length === 0 && <p className="text-sm text-neutral-500">Nothing here. {filter === "attention" ? "Every page has what it needs." : ""}</p>}
      <ul className="divide-y">
        {shown.map((r) => {
          const prefix = r.kind === "video" ? "/v/" : "/c/";
          const anchor = `${r.kind}-${r.id}`;
          const issue = needs(r);
          const open = openId === r.id;
          return (
            <li key={r.id} id={anchor} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium">{r.name} <span className="ml-1 rounded bg-neutral-200 px-1.5 py-0.5 text-xs font-normal">{r.kind}</span></div>
                  <div className="truncate font-mono text-xs text-neutral-500">{prefix}{r.ref}</div>
                  <div className="truncate text-xs text-neutral-600">{r.seo.title ? `Title: ${truncate(r.seo.title, 70)}` : "Title: automatic"} · {r.seo.description ? "Description: custom" : "Description: automatic"}{r.seo.noindex ? " · noindex" : ""}</div>
                </div>
                <div className="flex items-center gap-2">
                  {issue && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">{issue}</span>}
                  <a className={btnGhostCls} href={`${origin}${prefix}${r.ref}`} target="_blank" rel="noreferrer">View ↗</a>
                  {r.kind === "video" && <Link className={btnGhostCls} href={`/dashboard/${slug}/videos?edit=${r.id}`}>Edit video</Link>}
                  <button className={btnGhostCls} onClick={() => setOpenId(open ? null : r.id)}>{open ? "Close" : "Edit SEO"}</button>
                </div>
              </div>
              {open && (
                <div className="mt-3">
                  <SeoPanel
                    key={r.id}
                    initial={toListingValue(r.seo, r.seo.handle ?? (r.kind === "category" ? r.ref : ""))}
                    endpoint={r.kind === "video" ? `/api/videos/${r.id}` : `/api/categories/${r.id}`}
                    toBody={(v) => {
                      const body = { ...listingBody(v), keywords: v.keywords.split(",").map((k) => k.trim()).filter(Boolean) };
                      if (r.kind === "video") return { seo: body };
                      const { handle, ...seo } = body;
                      return { handle: handle || r.ref, seo };
                    }}
                    onSaved={(_res, v) => setRows((cur) => cur.map((x) => (x.id === r.id ? {
                      ...x, ref: v.handle || (x.kind === "video" ? x.id : x.ref),
                      seo: { ...x.seo, title: v.title, description: v.description, handle: v.handle || undefined, noindex: v.noindex, keywords: v.keywords.split(",").map((k) => k.trim()).filter(Boolean) },
                    } : x)))}
                    origin={origin} pathPrefix={prefix} handleEditable defaultHandle={r.kind === "video" ? r.id : r.ref}
                    fallbackTitle={r.name} fallbackDescription={truncate(r.description || (r.kind === "video" ? `Watch ${r.name} on ${siteName}.` : `Browse ${r.name} videos on ${siteName}.`), 155)}
                    siteName={siteName} template={template} applyTemplate defaultOpen
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
