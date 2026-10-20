"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, Field, btnCls, btnGhostCls, inputCls } from "@/components/ui";

export type SiteSeoValues = {
  titleTemplate: string; keywords: string; organizationName: string; locale: string; twitterHandle: string;
  googleVerification: string; bingVerification: string; socials: string; ogImage: string;
  extraMeta: string; jsonLd: string;
};

async function send(url: string, init: RequestInit) {
  const res = await fetch(url, init).catch(() => null);
  const data = await res?.json().catch(() => ({}));
  return { ok: !!res?.ok, data };
}

/** Site-wide SEO (title template, keywords, locale, verification, social profiles, share image, favicon). Client-side saves. */
export default function SiteSettings({ tenantId, siteName, initial, faviconUrl }: { tenantId: string; siteName: string; initial: SiteSeoValues; faviconUrl: string | null }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<SiteSeoValues>) => { setV({ ...v, ...patch }); setMsg(null); };

  async function save() {
    setBusy(true);
    const r = await send(`/api/sites/${tenantId}/seo`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...v,
        socials: v.socials.split(/\r?\n/).map((x) => x.trim()).filter(Boolean),
        // "name: content" lines -> [{name, content}] (validated server-side; platform-managed names are refused)
        extraMeta: v.extraMeta.split(/\r?\n/).map((l) => /^\s*([^:\s]+)\s*:\s*(.+?)\s*$/.exec(l)).filter((m): m is RegExpExecArray => !!m).map((m) => ({ name: m[1], content: m[2] })),
      }),
    });
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: "Saved" } : { ok: false, text: r.data?.issues?.[0]?.message ?? r.data?.error ?? "Could not save" });
    if (r.ok) router.refresh();
  }

  async function upload(kind: "favicon" | "og", file: File | undefined) {
    if (!file) return;
    const fd = new FormData();
    fd.set("kind", kind);
    fd.set("file", file);
    const r = await send(`/api/sites/${tenantId}/branding`, { method: "POST", body: fd });
    if (r.ok) {
      if (kind === "og") setV((cur) => ({ ...cur, ogImage: r.data.url }));
      setMsg({ ok: true, text: kind === "og" ? "Share image updated" : "Favicon updated" });
      router.refresh();
    } else setMsg({ ok: false, text: r.data?.error ?? "Upload failed" });
  }

  return (
    <Card title="Site-wide settings">
      <Field label="Title template for inner pages" hint={`%s becomes each page's title. Example: "%s | ${siteName}"`}>
        <input className={inputCls} value={v.titleTemplate} onChange={(e) => set({ titleTemplate: e.target.value })} placeholder={`%s · ${siteName}`} maxLength={80} />
      </Field>
      <Field label="Keywords (comma separated)" hint="Up to 15. Added to every page.">
        <input className={inputCls} value={v.keywords} onChange={(e) => set({ keywords: e.target.value })} placeholder="cooking, recipes, kitchen tips" />
      </Field>
      <div className="grid gap-x-4 sm:grid-cols-3">
        <Field label="Brand name (structured data)"><input className={inputCls} value={v.organizationName} onChange={(e) => set({ organizationName: e.target.value })} placeholder={siteName} maxLength={80} /></Field>
        <Field label="Language / locale" hint="en, en_US, fr…"><input className={inputCls} value={v.locale} onChange={(e) => set({ locale: e.target.value })} placeholder="en" /></Field>
        <Field label="Twitter / X handle"><input className={inputCls} value={v.twitterHandle} onChange={(e) => set({ twitterHandle: e.target.value })} placeholder="@mychannel" /></Field>
      </div>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Google Search Console code" hint="content value of the google-site-verification tag"><input className={inputCls} value={v.googleVerification} onChange={(e) => set({ googleVerification: e.target.value })} /></Field>
        <Field label="Bing Webmaster code" hint="content value of the msvalidate.01 tag"><input className={inputCls} value={v.bingVerification} onChange={(e) => set({ bingVerification: e.target.value })} /></Field>
      </div>
      <Field label="Social profile URLs (one per line, https)" hint="Added as sameAs in structured data.">
        <textarea className={`${inputCls} h-20`} value={v.socials} onChange={(e) => set({ socials: e.target.value })} placeholder={"https://x.com/mychannel\nhttps://www.instagram.com/mychannel"} />
      </Field>

      <Field label="Custom meta tags for every page (one per line, name: content)" hint="Example: author: Jane Doe. Tags the platform manages itself (robots, description, viewport…) are not allowed.">
        <textarea className={`${inputCls} h-16 font-mono text-xs`} value={v.extraMeta} onChange={(e) => set({ extraMeta: e.target.value })} />
      </Field>
      <Field label="Custom structured data for the home page (JSON-LD)" hint="Valid JSON with a schema.org @context. Added to your home page.">
        <textarea className={`${inputCls} h-20 font-mono text-xs`} value={v.jsonLd} onChange={(e) => set({ jsonLd: e.target.value })} />
      </Field>

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-sm font-medium">Social sharing image</div>
          {v.ogImage && <img src={v.ogImage} alt="Current share image" className="mb-2 h-20 rounded border" />}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="text-sm" onChange={(e) => upload("og", e.target.files?.[0])} />
          <p className="mt-1 text-xs text-neutral-500">1200×630 works best. Shown when links are shared on social networks.</p>
        </div>
        <div>
          <div className="mb-1 text-sm font-medium">Favicon</div>
          {faviconUrl && <img src={faviconUrl} alt="Current favicon" className="mb-2 h-10 w-10" />}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="text-sm" onChange={(e) => upload("favicon", e.target.files?.[0])} />
          <p className="mt-1 text-xs text-neutral-500">Square, at least 48×48 px.</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" className={btnCls} disabled={busy} onClick={save}>{busy ? "Saving…" : "Save site-wide settings"}</button>
        <button type="button" className={btnGhostCls} onClick={() => { setV(initial); setMsg(null); }}>Reset</button>
        {msg && <span role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</span>}
      </div>
    </Card>
  );
}
