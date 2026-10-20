"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import SearchListing, { listingBody, toListingValue, type ListingValue } from "@/components/seo/SearchListing";
import { Card, btnCls, btnDangerCls, btnGhostCls, inputCls } from "@/components/ui";
import { slugifyHandle } from "@/lib/seo";

export type PageDTO = {
  id: string | null;
  key: string | null;
  slug: string;
  title: string;
  markdown: string;
  description: string;
  group: "help" | "legal" | "more";
  mandatory: boolean;
  custom: boolean;
  customized: boolean;
  published: boolean;
  inFooter: boolean;
  seo: { title?: string; description?: string; keywords?: string[]; ogImage?: string; canonicalUrl?: string; noindex?: boolean; handle?: string };
};

const NEW: PageDTO = { id: null, key: null, slug: "", title: "", markdown: "## Heading\n\nWrite your page here. You can use **bold**, *italic*, lists, links and images (https only).", description: "", group: "more", mandatory: false, custom: true, customized: false, published: true, inFooter: true, seo: {} };

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
  const data = await res?.json().catch(() => ({}));
  return { ok: !!res?.ok, data };
}

export default function PagesManager({ tenantId, origin, siteName, pages }: { tenantId: string; origin: string; siteName: string; pages: PageDTO[] }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const rows = pages;
  const edit = editing === "new" ? NEW : rows.find((p) => (p.id ?? `sys-${p.key}`) === editing);
  const rowId = (p: PageDTO) => p.id ?? `sys-${p.key}`;
  const badge = (p: PageDTO) => (p.custom ? "Custom" : p.customized ? "Customised" : "Default");

  return (
    <Card title={`Pages (${rows.length})`}>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-neutral-600">Standard sections for a video site are created for you. Edit any of them, or add your own.</p>
        <button className={btnCls} onClick={() => setEditing("new")}>New page</button>
      </div>
      <ul className="divide-y">
        {rows.map((p) => (
          <li key={rowId(p)} className="py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-medium">{p.title} <span className="ml-1 rounded bg-neutral-200 px-1.5 py-0.5 text-xs font-normal">{badge(p)}</span>
                  {p.mandatory && <span className="ml-1 rounded bg-blue-100 px-1.5 py-0.5 text-xs font-normal text-blue-900" title="Required for video sites: can be edited but not hidden">required</span>}
                  {!p.published && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-normal text-amber-900">hidden</span>}
                </div>
                <div className="truncate font-mono text-xs text-neutral-500">/{p.slug}</div>
              </div>
              <div className="flex gap-2">
                {p.published && <a className={btnGhostCls} href={`${origin}/${p.slug}`} target="_blank" rel="noreferrer">View ↗</a>}
                <button className={btnGhostCls} onClick={() => setEditing(editing === rowId(p) ? null : rowId(p))}>{editing === rowId(p) ? "Close" : "Edit"}</button>
              </div>
            </div>
            {editing === rowId(p) && edit && <PageEditor key={rowId(p)} page={edit} tenantId={tenantId} origin={origin} siteName={siteName} onDone={() => setEditing(null)} />}
          </li>
        ))}
      </ul>
      {editing === "new" && <div className="mt-4 rounded-lg border p-4"><h3 className="mb-3 font-semibold">New page</h3><PageEditor key="new" page={NEW} tenantId={tenantId} origin={origin} siteName={siteName} onDone={() => setEditing(null)} /></div>}
    </Card>
  );
}

function PageEditor({ page, tenantId, origin, siteName, onDone }: { page: PageDTO; tenantId: string; origin: string; siteName: string; onDone: () => void }) {
  const router = useRouter();
  const isNew = !page.id && page.custom;
  const [title, setTitle] = useState(page.title);
  const [slug, setSlug] = useState(page.slug);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [content, setContent] = useState(page.markdown);
  const [published, setPublished] = useState(page.published);
  const [inFooter, setInFooter] = useState(page.inFooter);
  const [listing, setListing] = useState<ListingValue>(toListingValue(page.seo));
  const [html, setHtml] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { if (isNew && !slugTouched) setSlug(slugifyHandle(title)); }, [title, isNew, slugTouched]);

  // live preview: rendered by the server with the SAME sanitiser the storefront uses
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await call("/api/pages/preview", "POST", { content });
      if (r.ok) setHtml(r.data.html);
    }, 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [content]);

  async function save() {
    setBusy(true);
    const { handle: _h, ...seo } = { ...listingBody(listing), keywords: listing.keywords.split(",").map((k) => k.trim()).filter(Boolean) };
    void _h;
    const body = { title, content, published, inFooter, seo };
    const r = page.id
      ? await call(`/api/pages/${page.id}`, "PATCH", { ...body, ...(page.custom ? { slug } : {}) })
      : await call(`/api/sites/${tenantId}/pages`, "POST", page.key ? { ...body, systemKey: page.key } : { ...body, slug });
    setBusy(false);
    if (r.ok) { setMsg({ ok: true, text: "Saved" }); router.refresh(); if (isNew) onDone(); }
    else setMsg({ ok: false, text: r.data?.issues?.[0]?.message ?? r.data?.error ?? "Could not save" });
  }
  async function remove() {
    if (!page.id || !confirm(page.custom ? "Delete this page permanently?" : "Reset this page to the generated default?")) return;
    const r = await call(`/api/pages/${page.id}`, "DELETE");
    if (r.ok) { router.refresh(); onDone(); } else setMsg({ ok: false, text: r.data?.error ?? "Could not remove" });
  }

  return (
    <div className="mt-3 grid gap-3 rounded-md bg-neutral-50 p-3 text-sm">
      <label className="block"><span className="mb-1 block font-medium">Title</span><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} /></label>
      {page.custom && (
        <label className="block"><span className="mb-1 block font-medium">URL</span>
          <div className="flex items-center overflow-hidden rounded-md border border-neutral-300 bg-white"><span className="whitespace-nowrap bg-neutral-100 px-2 py-2 text-xs text-neutral-600">{origin.replace(/^https?:\/\//, "")}/</span>
            <input className="w-full px-2 py-2 focus:outline-none" value={slug} maxLength={80} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-{2,}/g, "-")); }} /></div></label>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        <label className="block"><span className="mb-1 flex justify-between font-medium"><span>Content (Markdown)</span><span className="text-xs font-normal text-neutral-500">{content.length.toLocaleString()} chars</span></span>
          <textarea className={`${inputCls} h-80 font-mono text-xs`} value={content} onChange={(e) => setContent(e.target.value)} /></label>
        <div><span className="mb-1 block font-medium">Preview</span>
          <div className="prose h-80 overflow-auto rounded-md border bg-white p-3 [&_a]:text-blue-700 [&_a]:underline [&_h2]:mt-3 [&_h2]:text-lg [&_h2]:font-bold [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:my-2 [&_table]:border [&_td]:border [&_td]:px-2 [&_th]:border [&_th]:px-2" dangerouslySetInnerHTML={{ __html: html }} /></div>
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2"><input type="checkbox" checked={published} disabled={page.mandatory} onChange={(e) => setPublished(e.target.checked)} /> Published{page.mandatory ? " (required)" : ""}</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={inFooter} disabled={page.mandatory} onChange={(e) => setInFooter(e.target.checked)} /> Show in footer</label>
      </div>
      <SearchListing value={listing} onChange={setListing} origin={origin} pathPrefix="" handleEditable={false} fallbackTitle={title || "Page"} fallbackDescription={page.description || `${title} on ${siteName}`} siteName={siteName} applyTemplate />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btnCls} disabled={busy || !title.trim() || (page.custom && !slug)} onClick={save}>{busy ? "Saving…" : isNew ? "Create page" : "Save page"}</button>
        {page.id && <button type="button" className={page.custom ? btnDangerCls : btnGhostCls} onClick={remove}>{page.custom ? "Delete page" : "Reset to default"}</button>}
        {msg && <span role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-green-700" : "text-red-700"}>{msg.text}</span>}
      </div>
    </div>
  );
}
