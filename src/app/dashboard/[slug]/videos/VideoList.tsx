"use client";

import { useEffect, useState } from "react";
import SearchListing, { listingBody, toListingValue } from "@/components/seo/SearchListing";
import { Card, btnDangerCls, btnGhostCls, inputCls } from "@/components/ui";
import { truncate } from "@/lib/seo";
import { useRouter, useSearchParams } from "next/navigation";

type Row = {
  id: string; handle?: string; title: string; description: string | null; status: string; visibility: string; featured: boolean;
  categoryId: string | null; ingestMethod: string; sourceUrl: string | null; failureReason: string | null;
  importProgress: number; durationSec: number | null; views: number; createdAt: string;
  tags: string[]; chapters: string; transcript: string; captions: Cap[]; thumb?: string; publishAt?: string | null; likes?: number;
  seo: { handle?: string; title?: string; description?: string; keywords?: string[]; ogImage?: string; canonicalUrl?: string; noindex?: boolean };
};
type Site = { name: string; origin: string };
type Cap = { lang: string; label: string };
type Live = { status: string; percent: number; failureReason: string | null };

const LABEL: Record<string, string> = { UPLOADING: "uploading", IMPORTING: "importing", PROCESSING: "processing", READY: "ready", FAILED: "failed", BLOCKED: "blocked" };
const COLOR: Record<string, string> = {
  UPLOADING: "bg-amber-100 text-amber-900", IMPORTING: "bg-blue-100 text-blue-900", PROCESSING: "bg-indigo-100 text-indigo-900",
  READY: "bg-green-100 text-green-900", FAILED: "bg-red-100 text-red-900", BLOCKED: "bg-neutral-300 text-neutral-900",
};
const ACTIVE = new Set(["IMPORTING", "PROCESSING", "UPLOADING"]);

export default function VideoList({ initial, categories, site }: { initial: Row[]; categories: { id: string; name: string }[]; site: Site }) {
  const [rows, setRows] = useState(initial);
  const [live, setLive] = useState<Record<string, Live>>({});
  const router = useRouter();
  const params = useSearchParams();
  const [editing, setEditing] = useState<string | null>(params.get("edit"));
  const [seoFor, setSeoFor] = useState<string | null>(params.get("seo") === "1" ? params.get("edit") : null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setRows(initial), [initial]);

  // Live progress: poll status for anything still in flight.
  useEffect(() => {
    const ids = rows.filter((r) => ACTIVE.has((live[r.id]?.status ?? r.status))).map((r) => r.id);
    if (!ids.length) return;
    const t = setInterval(async () => {
      for (const id of ids) {
        const res = await fetch(`/api/videos/${id}/status`).catch(() => null);
        if (res?.ok) {
          const s = await res.json();
          setLive((l) => ({ ...l, [id]: { status: s.status, percent: s.percent, failureReason: s.failureReason } }));
        }
      }
    }, 2000);
    return () => clearInterval(t);
  }, [rows, live]);

  async function call(url: string, method: string, body?: unknown) {
    setError(null);
    const res = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data?.error ?? "Something went wrong");
    return res.ok;
  }

  async function remove(id: string) {
    if (!confirm("Delete this video permanently?")) return;
    if (await call(`/api/videos/${id}`, "DELETE")) setRows((r) => r.filter((x) => x.id !== id));
  }
  async function retry(id: string) {
    if (await call(`/api/videos/${id}/retry`, "POST")) setLive((l) => ({ ...l, [id]: { status: "IMPORTING", percent: 0, failureReason: null } }));
  }
  async function save(id: string, patch: Partial<Row>) {
    if (await call(`/api/videos/${id}`, "PATCH", patch)) {
      setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));
      setEditing(null);
      router.refresh(); // re-read normalised tags/chapters/handle from the server
    }
  }

  return (
    <Card title={`Videos (${rows.length})`}>
      {error && <p role="alert" className="mb-3 rounded bg-red-50 p-2 text-sm text-red-800">{error}</p>}
      {rows.length === 0 && <p className="text-sm text-neutral-500">No videos yet. Upload one above.</p>}
      <ul className="divide-y">
        {rows.map((r) => {
          const l = live[r.id];
          const status = l?.status ?? r.status;
          const reason = l?.failureReason ?? r.failureReason;
          const percent = l?.percent ?? r.importProgress;
          return (
            <li key={r.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium">{r.title}</div>
                  <div className="text-xs text-neutral-500">
                    {r.ingestMethod === "URL" ? "imported" : "uploaded"} · {r.publishAt ? `scheduled for ${new Date(r.publishAt).toLocaleString()}` : r.visibility.toLowerCase()} · {r.views} views{r.likes ? ` · ${r.likes} likes` : ""}
                    {r.featured && " · featured"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${COLOR[status]}`}>{LABEL[status]}{status === "IMPORTING" && percent ? ` ${percent}%` : ""}</span>
                  {status === "FAILED" && r.ingestMethod === "URL" && <button className={btnGhostCls} onClick={() => retry(r.id)}>Retry</button>}
                  <button className={btnGhostCls} onClick={() => { setSeoFor(null); setEditing(editing === r.id ? null : r.id); }}>Edit</button>
                  <button className={btnGhostCls} onClick={() => { setSeoFor(r.id); setEditing(r.id); }}>SEO</button>
                  <button className={btnDangerCls} onClick={() => remove(r.id)}>Delete</button>
                </div>
              </div>
              {status === "IMPORTING" && <div className="mt-2 h-1.5 overflow-hidden rounded bg-neutral-200"><div className="h-full bg-blue-600" style={{ width: `${percent}%` }} /></div>}
              {(status === "FAILED" || status === "BLOCKED") && reason && <p className="mt-1 text-sm text-red-700">{reason}</p>}
              {editing === r.id && <EditForm key={`${r.id}-${seoFor === r.id}`} row={r} categories={categories} site={site} seoOpen={seoFor === r.id} onSave={(p) => save(r.id, p)} />}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function EditForm({ row, categories, site, seoOpen, onSave }: { row: Row; categories: { id: string; name: string }[]; site: Site; seoOpen: boolean; onSave: (p: Partial<Row>) => void }) {
  const [title, setTitle] = useState(row.title);
  const [description, setDescription] = useState(row.description ?? "");
  const [visibility, setVisibility] = useState(row.visibility);
  const [categoryId, setCategoryId] = useState(row.categoryId ?? "");
  const [featured, setFeatured] = useState(row.featured);
  const [publishAt, setPublishAt] = useState(row.publishAt ? toLocalInput(row.publishAt) : "");
  const [listing, setListing] = useState(toListingValue(row.seo));
  const [tags, setTags] = useState(row.tags.map((t) => t.replace(/-/g, " ")).join(", "));
  const [chapters, setChapters] = useState(row.chapters);
  const [transcript, setTranscript] = useState(row.transcript);
  return (
    <div className="mt-3 grid gap-2 rounded-md bg-neutral-50 p-3 text-sm">
      <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} aria-label="Title" />
      <textarea className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={5000} placeholder="Description" />
      <Thumbnail row={row} />
      <div className="flex flex-wrap gap-2">
        <select className={inputCls + " !w-auto"} value={visibility} onChange={(e) => setVisibility(e.target.value)} disabled={row.status === "BLOCKED"}>
          <option value="PUBLIC">Public</option><option value="UNLISTED">Unlisted</option><option value="PRIVATE">Private</option>
        </select>
        <select className={inputCls + " !w-auto"} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">No category</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="flex items-center gap-1"><input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} /> Featured</label>
      </div>
      <label className="block"><span className="mb-1 block font-medium">Schedule publishing</span>
        <input type="datetime-local" className={inputCls + " !w-auto"} value={publishAt} onChange={(e) => setPublishAt(e.target.value)} />
        <span className="mt-1 block text-xs text-neutral-500">The video stays private and goes public at this time (your local time). Clear the field to cancel the schedule.</span></label>
      <label className="block"><span className="mb-1 block font-medium">Tags (comma separated)</span>
        <input className={inputCls} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="home workout, beginner, yoga" />
        <span className="mt-1 block text-xs text-neutral-500">Tags create /tag/… pages and link related videos together. Up to 15.</span></label>
      <label className="block"><span className="mb-1 block font-medium">Chapters</span>
        <textarea className={`${inputCls} font-mono text-xs`} rows={4} value={chapters} onChange={(e) => setChapters(e.target.value)} placeholder={"0:00 Intro\n1:30 Warm up\n12:05 Cool down"} />
        <span className="mt-1 block text-xs text-neutral-500">One per line, starting with a time. Google can show these as key moments in search results.</span></label>
      <label className="block"><span className="mb-1 flex justify-between font-medium"><span>Transcript</span><span className="text-xs font-normal text-neutral-500">{transcript.length.toLocaleString()} chars</span></span>
        <textarea className={inputCls} rows={4} value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="Plain text of what is said in the video. Shown on the watch page, it gives search engines real content to index." /></label>
      <Captions row={row} />
      <SearchListing
        socialImage={`/api/media/${(row as unknown as { thumb?: string }).thumb ?? ""}`}
        value={listing} onChange={setListing} origin={site.origin} pathPrefix="/v/" handleEditable defaultHandle={row.id} savedHandle={row.seo?.handle ?? ""}
        fallbackTitle={title} fallbackDescription={truncate(description || `Watch ${title} on ${site.name}.`, 155)} siteName={site.name} defaultOpen={seoOpen}
      />
      <div><button className={btnGhostCls} onClick={() => onSave({
        title, description: description || null, visibility, categoryId: categoryId || null, featured,
        ...(publishAt !== (row.publishAt ? toLocalInput(row.publishAt) : "") ? { publishAt: (publishAt ? new Date(publishAt).toISOString() : null) as unknown as string } : {}),
        tags: tags as unknown as string[], chapters: chapters as unknown as string, transcript: (transcript || null) as unknown as string,
        seo: { ...listingBody(listing), keywords: listing.keywords.split(",").map((k) => k.trim()).filter(Boolean) } as unknown as Row["seo"],
      })}>Save</button></div>
    </div>
  );
}

/** Caption (subtitle) files: WebVTT or SRT per language. The first one also becomes the transcript if none is written. */
function Captions({ row }: { row: Row }) {
  const [caps, setCaps] = useState<Cap[]>(row.captions);
  const [lang, setLang] = useState("en");
  const [label, setLabel] = useState("English");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("lang", lang); fd.set("label", label); fd.set("file", file);
    const res = await fetch(`/api/videos/${row.id}/captions`, { method: "POST", body: fd }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    setBusy(false);
    if (res?.ok) { setCaps(data.captions); setMsg({ ok: true, text: data.transcriptFilled ? "Captions added and the transcript was filled in from them." : "Captions added." }); }
    else setMsg({ ok: false, text: data?.error ?? "Upload failed" });
  }
  async function remove(l: string) {
    const res = await fetch(`/api/videos/${row.id}/captions?lang=${encodeURIComponent(l)}`, { method: "DELETE" }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    if (res?.ok) setCaps(data.captions);
  }
  return (
    <div className="rounded-md border bg-white p-3">
      <div className="mb-2 font-medium">Captions / subtitles</div>
      <ul className="mb-2 space-y-1">{caps.map((c) => <li key={c.lang} className="flex items-center justify-between"><span>{c.label} <span className="text-xs text-neutral-500">({c.lang})</span></span><button type="button" className={btnDangerCls} onClick={() => remove(c.lang)}>Remove</button></li>)}{caps.length === 0 && <li className="text-neutral-500">No captions yet.</li>}</ul>
      <div className="flex flex-wrap items-center gap-2">
        <input className={inputCls + " !w-20"} value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language code" placeholder="en" />
        <input className={inputCls + " !w-32"} value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Label" placeholder="English" />
        <input type="file" accept=".vtt,.srt,text/vtt" disabled={busy} onChange={(e) => upload(e.target.files?.[0])} />
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-1 text-xs ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</p>}
    </div>
  );
}

/** ISO instant -> value for <input type="datetime-local"> in the viewer's timezone. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Owner-supplied thumbnail (poster image). Uploaded straight away; ffmpeg re-encodes it to the two sizes the storefront uses. */
function Thumbnail({ row }: { row: Row }) {
  const [src, setSrc] = useState(row.thumb ? `/api/media/${row.thumb}` : "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch(`/api/videos/${row.id}/thumbnail`, { method: "POST", body: fd }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    setBusy(false);
    if (res?.ok) { setSrc(`/api/media/${data.thumb}?v=${Date.now()}`); setMsg({ ok: true, text: "Thumbnail updated. Visitors may see the old one for up to an hour (browser cache)." }); }
    else setMsg({ ok: false, text: data?.error ?? "Upload failed" });
  }
  return (
    <div className="flex items-center gap-3 rounded-md border bg-white p-3">
      {src ? <img src={src} alt="Current thumbnail" className="h-14 w-24 rounded object-cover" /> : <div className="grid h-14 w-24 place-items-center rounded bg-neutral-200 text-xs text-neutral-500">none yet</div>}
      <div className="text-xs">
        <div className="mb-1 text-sm font-medium">Thumbnail</div>
        <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || row.status !== "READY"} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
        <p className="mt-1 text-neutral-500">{row.status === "READY" ? "16:9, at least 1280×720 looks best. PNG, JPEG or WebP, up to 5 MB." : "Available once the video has finished processing."}</p>
        {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-green-700" : "text-red-700"}>{msg.text}</p>}
      </div>
    </div>
  );
}
