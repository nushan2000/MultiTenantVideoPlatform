"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Card, btnCls, btnGhostCls, formatBytes, inputCls } from "@/components/ui";

type Limits = { maxUploadBytes: number; canUseUrlImport: boolean; maxImportBatch: number };
type Job = { name: string; percent: number; state: "uploading" | "done" | "error"; message?: string };

const CONCURRENCY = 3;
const RETRIES = 3;

async function api<T>(url: string, body?: unknown, method = body ? "POST" : "GET"): Promise<T> {
  const res = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

/** PUT one part straight to object storage with progress (XHR: fetch has no upload progress). */
function putPart(url: string, blob: Blob, onBytes: (loaded: number) => void): Promise<string | null> {
  return new Promise<string | null>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => onBytes(e.loaded);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve(xhr.getResponseHeader("ETag")) : reject(new Error(`Part upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(blob);
  });
}

/** Chunked, parallel, resumable upload: part state lives in the object store, so a reload picks up where it left off. */
async function uploadFile(tenantId: string, file: File, onProgress: (p: number) => void) {
  const resumeKey = `upload:${tenantId}:${file.name}:${file.size}:${file.lastModified}`;
  let videoId: string | null = null;
  let partSize = 0;
  let totalParts = 0;
  const done = new Map<number, number>(); // part -> bytes

  const saved = localStorage.getItem(resumeKey);
  if (saved) {
    try {
      const r = await api<{ partSize: number; totalParts: number; parts: { PartNumber: number; Size: number }[] }>(`/api/videos/${saved}/upload`);
      videoId = saved;
      partSize = r.partSize;
      totalParts = r.totalParts;
      r.parts.forEach((p) => done.set(p.PartNumber, p.Size));
    } catch {
      localStorage.removeItem(resumeKey);
    }
  }
  if (!videoId) {
    const init = await api<{ videoId: string; partSize: number; totalParts: number }>("/api/videos/init", {
      tenantId, filename: file.name, sizeBytes: file.size, contentType: file.type || "video/mp4",
    });
    videoId = init.videoId;
    partSize = init.partSize;
    totalParts = init.totalParts;
    localStorage.setItem(resumeKey, videoId);
  }

  const inflight = new Map<number, number>();
  const report = () => {
    const doneBytes = [...done.values()].reduce((a, b) => a + b, 0) + [...inflight.values()].reduce((a, b) => a + b, 0);
    onProgress(Math.min(99, Math.floor((doneBytes / file.size) * 100)));
  };
  report();

  const pending = Array.from({ length: totalParts }, (_, i) => i + 1).filter((n) => !done.has(n));
  const worker = async () => {
    for (let n = pending.shift(); n !== undefined; n = pending.shift()) {
      const blob = file.slice((n - 1) * partSize, Math.min(n * partSize, file.size));
      for (let attempt = 1; ; attempt++) {
        try {
          const { urls } = await api<{ urls: { partNumber: number; url: string }[] }>(`/api/videos/${videoId}/part-urls`, { partNumbers: [n] });
          const etag = await putPart(urls[0].url, blob, (loaded) => {
            inflight.set(n, loaded);
            report();
          });
          // Tell the server which ETag the store returned (needed to complete; also makes resume work on stores without ListParts).
          if (etag) await api(`/api/videos/${videoId}/parts`, { partNumber: n, etag });
          inflight.delete(n);
          done.set(n, blob.size);
          report();
          break;
        } catch (e) {
          inflight.delete(n);
          if (attempt >= RETRIES) throw e;
          await new Promise((r) => setTimeout(r, 500 * 2 ** attempt)); // per-part retry with backoff
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));
  await api("/api/videos/complete", { videoId });
  localStorage.removeItem(resumeKey);
  onProgress(100);
}

export default function UploadPanel({ tenantId, limits }: { tenantId: string; limits: Limits }) {
  const router = useRouter();
  const [tab, setTab] = useState<"file" | "url">("file");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // URL import
  const [urls, setUrls] = useState("");
  const [rights, setRights] = useState(false);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string }[]>([]);
  const [importing, setImporting] = useState(false);

  function startFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      if (file.size > limits.maxUploadBytes) {
        setJobs((j) => [...j, { name: file.name, percent: 0, state: "error", message: `Too large (max ${formatBytes(limits.maxUploadBytes)} on your plan)` }]);
        continue;
      }
      const set = (patch: Partial<Job>) => setJobs((j) => j.map((x) => (x.name === file.name ? { ...x, ...patch } : x)));
      setJobs((j) => [...j.filter((x) => x.name !== file.name), { name: file.name, percent: 0, state: "uploading" }]);
      uploadFile(tenantId, file, (percent) => set({ percent }))
        .then(() => {
          set({ state: "done", percent: 100 });
          router.refresh();
        })
        .catch((e: Error) => set({ state: "error", message: e.message }));
    }
  }

  async function submitImport(e: React.FormEvent) {
    e.preventDefault();
    const list = urls.split(/\s+/).map((u) => u.trim()).filter(Boolean);
    if (!list.length) return;
    setImporting(true);
    setImportMsg([]);
    try {
      const r = await api<{ items: { url: string; videoId?: string; error?: string }[] }>("/api/videos/import", { tenantId, urls: list, rightsConfirmed: rights });
      setImportMsg(r.items.map((i) => ({ ok: !!i.videoId, text: i.videoId ? `Queued: ${i.url}` : `${i.url}: ${i.error}` })));
      if (r.items.some((i) => i.videoId)) {
        setUrls("");
        router.refresh();
      }
    } catch (err) {
      setImportMsg([{ ok: false, text: (err as Error).message }]);
    } finally {
      setImporting(false);
    }
  }

  return (
    <Card title="Add videos">
      <div className="mb-4 flex gap-2">
        <button className={tab === "file" ? btnCls : btnGhostCls} onClick={() => setTab("file")}>Upload file</button>
        {limits.canUseUrlImport && <button className={tab === "url" ? btnCls : btnGhostCls} onClick={() => setTab("url")}>Import from URL</button>}
      </div>

      {tab === "file" && (
        <>
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); startFiles(e.dataTransfer.files); }}
            onClick={() => input.current?.click()}
            className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center text-sm ${drag ? "border-blue-500 bg-blue-50" : "border-neutral-300"}`}
          >
            Drag &amp; drop video files here, or click to choose
            <div className="mt-1 text-xs text-neutral-500">Up to {formatBytes(limits.maxUploadBytes)} per file · uploads resume if interrupted</div>
            <input ref={input} type="file" accept="video/*,.mkv,.mov" multiple hidden onChange={(e) => e.target.files && startFiles(e.target.files)} />
          </div>
          <ul className="mt-3 space-y-2">
            {jobs.map((j) => (
              <li key={j.name} className="text-sm">
                <div className="flex justify-between"><span className="truncate">{j.name}</span><span>{j.state === "error" ? "Failed" : j.state === "done" ? "Uploaded: processing" : `${j.percent}%`}</span></div>
                <div className="h-2 overflow-hidden rounded bg-neutral-200"><div className={`h-full ${j.state === "error" ? "bg-red-500" : "bg-blue-600"}`} style={{ width: `${j.percent}%` }} /></div>
                {j.message && <p className="text-xs text-red-700">{j.message}</p>}
              </li>
            ))}
          </ul>
        </>
      )}

      {tab === "url" && (
        <form onSubmit={submitImport}>
          <textarea className={`${inputCls} h-28 font-mono`} value={urls} onChange={(e) => setUrls(e.target.value)} placeholder={"https://example.com/video.mp4\n(one URL per line, up to " + limits.maxImportBatch + ")"} />
          <p className="mt-1 text-xs text-neutral-500">Direct links to video files only (.mp4, .mov, .webm, .mkv…). Links to YouTube, Vimeo and similar sites are not supported.</p>
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-1" />
            <span>I own or have the rights to distribute this content.</span>
          </label>
          <button className={`${btnCls} mt-3`} disabled={!rights || !urls.trim() || importing}>{importing ? "Starting…" : "Start import"}</button>
          <ul className="mt-3 space-y-1 text-sm">{importMsg.map((m, i) => <li key={i} className={m.ok ? "text-green-700" : "text-red-700"}>{m.text}</li>)}</ul>
        </form>
      )}
    </Card>
  );
}
