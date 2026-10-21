"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, btnCls, btnDangerCls, btnGhostCls, inputCls } from "@/components/ui";

export type PlaylistDTO = { id: string; title: string; slug: string; description: string; published: boolean; videoIds: string[] };
type VideoOpt = { id: string; title: string; visibility: string };

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
  const data = await res?.json().catch(() => ({}));
  return { ok: !!res?.ok, data };
}

export default function PlaylistsManager({ tenantId, origin, playlists, videos }: { tenantId: string; origin: string; playlists: PlaylistDTO[]; videos: VideoOpt[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(playlists[0]?.id ?? null);
  const [title, setTitle] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function create() {
    const r = await call(`/api/sites/${tenantId}/playlists`, "POST", { title });
    if (r.ok) { setTitle(""); setOpen(r.data.id); router.refresh(); }
    else setMsg({ ok: false, text: r.data?.issues?.[0]?.message ?? r.data?.error ?? "Could not create the playlist" });
  }

  return (
    <Card title={`Playlists (${playlists.length})`}>
      <div className="mb-4 flex gap-2">
        <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="New playlist title, e.g. Beginner course" aria-label="New playlist title" onKeyDown={(e) => e.key === "Enter" && title.trim() && void create()} />
        <button className={btnCls} disabled={!title.trim()} onClick={create}>Create</button>
      </div>
      {msg && <p role="alert" className={`mb-3 text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</p>}
      {playlists.length === 0 && <p className="text-sm text-neutral-500">No playlists yet.</p>}
      <ul className="divide-y">
        {playlists.map((p) => (
          <li key={p.id} className="py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-medium">{p.title} {!p.published && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-normal text-amber-900">hidden</span>}</div>
                <div className="truncate font-mono text-xs text-neutral-500">/playlist/{p.slug} · {p.videoIds.length} video{p.videoIds.length === 1 ? "" : "s"}</div>
              </div>
              <div className="flex gap-2">
                {p.published && p.videoIds.length > 0 && <a className={btnGhostCls} href={`${origin}/playlist/${p.slug}`} target="_blank" rel="noreferrer">View ↗</a>}
                <button className={btnGhostCls} onClick={() => setOpen(open === p.id ? null : p.id)}>{open === p.id ? "Close" : "Edit"}</button>
              </div>
            </div>
            {open === p.id && <Editor key={p.id} playlist={p} videos={videos} onChanged={() => router.refresh()} />}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Editor({ playlist, videos, onChanged }: { playlist: PlaylistDTO; videos: VideoOpt[]; onChanged: () => void }) {
  const [title, setTitle] = useState(playlist.title);
  const [slug, setSlug] = useState(playlist.slug);
  const [description, setDescription] = useState(playlist.description);
  const [published, setPublished] = useState(playlist.published);
  const [ids, setIds] = useState(playlist.videoIds);
  const [pick, setPick] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const byId = new Map(videos.map((v) => [v.id, v]));
  const available = videos.filter((v) => !ids.includes(v.id));

  const move = (i: number, d: -1 | 1) => setIds((l) => { const n = [...l]; const j = i + d; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j], n[i]]; return n; });

  async function save() {
    setBusy(true);
    const r = await call(`/api/playlists/${playlist.id}`, "PATCH", { title, slug, description, published, videoIds: ids });
    setBusy(false);
    if (r.ok) { setMsg({ ok: true, text: "Saved" }); onChanged(); }
    else setMsg({ ok: false, text: r.data?.issues?.[0]?.message ?? r.data?.error ?? "Could not save" });
  }
  async function remove() {
    if (!confirm("Delete this playlist? The videos themselves are not deleted.")) return;
    const r = await call(`/api/playlists/${playlist.id}`, "DELETE");
    if (r.ok) onChanged(); else setMsg({ ok: false, text: r.data?.error ?? "Could not delete" });
  }

  return (
    <div className="mt-3 grid gap-3 rounded-md bg-neutral-50 p-3 text-sm">
      <label className="block"><span className="mb-1 block font-medium">Title</span><input className={inputCls} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} /></label>
      <label className="block"><span className="mb-1 block font-medium">URL</span>
        <input className={`${inputCls} font-mono`} value={slug} maxLength={60} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-{2,}/g, "-"))} /></label>
      <label className="block"><span className="mb-1 block font-medium">Description</span><textarea className={inputCls} rows={2} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Shown at the top of the playlist page and in search results" /></label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} /> Published</label>

      <div>
        <div className="mb-1 font-medium">Videos, in watching order</div>
        <ol className="space-y-1">
          {ids.map((id, i) => (
            <li key={id} className="flex items-center gap-2 rounded border bg-white px-2 py-1">
              <span className="w-6 text-right text-xs text-neutral-500">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{byId.get(id)?.title ?? "Video"}{byId.get(id) && byId.get(id)!.visibility !== "PUBLIC" && <span className="ml-1 text-xs text-amber-700">({byId.get(id)!.visibility.toLowerCase()}: hidden from visitors)</span>}</span>
              <button type="button" className={btnGhostCls} onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
              <button type="button" className={btnGhostCls} onClick={() => move(i, 1)} disabled={i === ids.length - 1} aria-label="Move down">↓</button>
              <button type="button" className={btnDangerCls} onClick={() => setIds((l) => l.filter((x) => x !== id))} aria-label="Remove from playlist">✕</button>
            </li>
          ))}
          {ids.length === 0 && <li className="text-neutral-500">No videos yet. Add some below.</li>}
        </ol>
        <div className="mt-2 flex gap-2">
          <select className={inputCls} value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Video to add">
            <option value="">Add a video…</option>
            {available.map((v) => <option key={v.id} value={v.id}>{v.title}</option>)}
          </select>
          <button type="button" className={btnGhostCls} disabled={!pick || ids.length >= 200} onClick={() => { setIds((l) => [...l, pick]); setPick(""); }}>Add</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btnCls} disabled={busy || !title.trim() || !slug} onClick={save}>{busy ? "Saving…" : "Save playlist"}</button>
        <button type="button" className={btnDangerCls} onClick={remove}>Delete</button>
        {msg && <span role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-green-700" : "text-red-700"}>{msg.text}</span>}
      </div>
    </div>
  );
}
