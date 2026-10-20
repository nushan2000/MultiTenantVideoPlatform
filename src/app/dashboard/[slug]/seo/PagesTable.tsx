"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import SeoPanel from "@/components/seo/SeoPanel";
import { listingBody, toListingValue } from "@/components/seo/SearchListing";
import { Card, btnGhostCls } from "@/components/ui";
import { parseCsv, toCsv } from "@/lib/csv";
import { truncate } from "@/lib/seo";
import { useRouter } from "next/navigation";

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
export default function PagesTable({ rows: initial, origin, siteName, template, slug, tenantId }: { rows: PageRow[]; origin: string; siteName: string; template: string; slug: string; tenantId: string }) {
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

  const router = useRouter();
  const [bulkMsg, setBulkMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // titles that appear on more than one page compete with each other in search results
  const titleCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) { const t = (r.seo.title || r.name).trim().toLowerCase(); m.set(t, (m.get(t) ?? 0) + 1); }
    return m;
  }, [rows]);
  const needs = (r: PageRow) =>
    (titleCount.get((r.seo.title || r.name).trim().toLowerCase()) ?? 0) > 1 ? "Duplicate title"
    : !r.seo.description && !r.description.trim() ? "Missing description"
    : !r.seo.title && r.kind === "category" ? "Using automatic title" : null;

  function exportCsv() {
    const csv = toCsv([["type", "id", "url", "seo_title", "seo_description"], ...rows.map((r) => [r.kind, r.id, `${origin}${r.kind === "video" ? "/v/" : "/c/"}${r.ref}`, r.seo.title ?? "", r.seo.description ?? ""])]);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `${slug}-seo.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  async function importCsv(file: File | undefined) {
    if (!file) return;
    const [head, ...body] = parseCsv(await file.text());
    const col = (n: string) => head?.indexOf(n) ?? -1;
    if (col("type") < 0 || col("id") < 0) return setBulkMsg({ ok: false, text: "The CSV needs type and id columns (export one to see the format)." });
    const changed = body
      .map((c) => ({ type: c[col("type")], id: c[col("id")], title: c[col("seo_title")] ?? "", description: c[col("seo_description")] ?? "" }))
      .filter((r) => (r.type === "video" || r.type === "category") && r.id)
      .filter((r) => { const cur = rows.find((x) => x.id === r.id); return cur && ((cur.seo.title ?? "") !== r.title || (cur.seo.description ?? "") !== r.description); });
    if (!changed.length) return setBulkMsg({ ok: true, text: "No changes found in that file." });
    const res = await fetch(`/api/sites/${tenantId}/seo/bulk`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rows: changed.slice(0, 500) }) }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    if (res?.ok) { setBulkMsg({ ok: true, text: `Updated ${data.updated} page${data.updated === 1 ? "" : "s"}${data.skipped?.length ? `, skipped ${data.skipped.length} unknown` : ""}.` }); router.refresh(); }
    else setBulkMsg({ ok: false, text: data?.issues?.[0]?.message ?? data?.error ?? "Import failed" });
  }
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
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <button className={btnGhostCls} onClick={exportCsv}>Export CSV</button>
        <label className={`${btnGhostCls} cursor-pointer`}>Import CSV<input type="file" accept=".csv,text/csv" hidden onChange={(e) => { void importCsv(e.target.files?.[0]); e.target.value = ""; }} /></label>
        <span className="text-xs text-neutral-500">Edit titles and descriptions in a spreadsheet, then import (up to 500 rows).</span>
        {bulkMsg && <span role={bulkMsg.ok ? "status" : "alert"} className={bulkMsg.ok ? "text-green-700" : "text-red-700"}>{bulkMsg.text}</span>}
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
