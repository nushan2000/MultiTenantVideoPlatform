"use client";

import { useEffect, useRef, useState } from "react";

type VastAd = { mediaUrl: string; impressions: string[]; errors: string[]; skipAfterSec: number | null };

/** Minimal VAST 2/3/4 resolver: follows up to 3 wrappers, picks the best progressive MP4. Returns null on any problem. */
async function resolveVast(tagUrl: string, depth = 0, acc: Pick<VastAd, "impressions" | "errors"> = { impressions: [], errors: [] }): Promise<VastAd | null> {
  if (depth > 3) return null;
  const res = await fetch(tagUrl, { signal: AbortSignal.timeout(5000), credentials: "omit" });
  if (!res.ok) return null;
  const doc = new DOMParser().parseFromString(await res.text(), "text/xml");
  const texts = (sel: string) => [...doc.querySelectorAll(sel)].map((n) => n.textContent?.trim() ?? "").filter((u) => u.startsWith("https://"));
  acc.impressions.push(...texts("Impression"));
  acc.errors.push(...texts("Error"));
  const wrapper = doc.querySelector("Wrapper VASTAdTagURI")?.textContent?.trim();
  if (wrapper?.startsWith("https://")) return resolveVast(wrapper, depth + 1, acc);
  const files = [...doc.querySelectorAll("MediaFile")]
    .map((n) => ({ url: n.textContent?.trim() ?? "", type: n.getAttribute("type") ?? "", h: Number(n.getAttribute("height") ?? 0) }))
    .filter((f) => f.url.startsWith("https://") && f.type === "video/mp4")
    .sort((a, b) => Math.abs(a.h - 480) - Math.abs(b.h - 480));
  if (!files.length) return null;
  const skip = doc.querySelector("Linear")?.getAttribute("skipoffset");
  const m = skip && /(\d+):(\d+):(\d+)/.exec(skip);
  return { mediaUrl: files[0].url, ...acc, skipAfterSec: m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null };
}

const ping = (urls: string[]) => urls.forEach((u) => void (new Image().src = u));

export type Track = { lang: string; label: string; src: string };

export default function HlsPlayer({ src, poster, videoId, vastTagUrl, tracks = [] }: { src: string; poster?: string | null; videoId: string; vastTagUrl?: string | null; tracks?: Track[] }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [ad, setAd] = useState<{ skippable: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let hls: import("hls.js").default | null = null;
    let cancelled = false;

    const startContent = async () => {
      if (cancelled) return;
      setAd(null);
      video.controls = true;
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = src;
      } else {
        const { default: Hls } = await import("hls.js");
        if (!Hls.isSupported()) return setError("Your browser cannot play this video.");
        hls = new Hls();
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_e, d) => d.fatal && setError("Playback error. Please try again."));
      }
      fetch("/api/public/view", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ videoId }) }).catch(() => {});
    };

    const playPreroll = async () => {
      if (!vastTagUrl) return startContent();
      try {
        const vast = await resolveVast(vastTagUrl);
        if (!vast || cancelled) return startContent();
        video.controls = false;
        video.src = vast.mediaUrl;
        setAd({ skippable: false });
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          video.removeEventListener("ended", finish);
          video.removeEventListener("error", onError);
          video.removeAttribute("src");
          startContent();
        };
        const onError = () => {
          ping(vast.errors);
          finish();
        };
        video.addEventListener("ended", finish);
        video.addEventListener("error", onError);
        (window as any).__skipAd = finish;
        video.addEventListener("playing", () => ping(vast.impressions), { once: true });
        if (vast.skipAfterSec !== null) setTimeout(() => !done && setAd({ skippable: true }), vast.skipAfterSec * 1000);
        await video.play().catch(() => finish()); // autoplay blocked: just show content instead of a dead ad
      } catch {
        startContent();
      }
    };

    // chapters / ?t=90 deep links: jump to a time (works before or after playback starts)
    const seek = (sec: number) => {
      const go = () => { video.currentTime = sec; void video.play().catch(() => {}); };
      if (video.readyState >= 1) go();
      else video.addEventListener("loadedmetadata", go, { once: true });
    };
    const onSeek = (e: Event) => seek(Number((e as CustomEvent).detail) || 0);
    window.addEventListener("sf-seek", onSeek);
    const t = Number(new URLSearchParams(window.location.search).get("t"));
    if (t > 0) video.addEventListener("loadedmetadata", () => { video.currentTime = t; }, { once: true });

    // Watch time for the owner's analytics: count seconds of real playback (content only, not ads) and report them in batches.
    let pending = 0;
    let last = 0;
    const onTime = () => {
      if (ref.current?.controls === false) return; // ad
      const now = video.currentTime;
      const delta = now - last;
      if (delta > 0 && delta < 2) pending += delta; // normal playback; ignores seeks
      last = now;
    };
    const flush = (beacon = false) => {
      const seconds = Math.min(120, Math.floor(pending));
      if (seconds < 1) return;
      pending -= seconds;
      const body = JSON.stringify({ videoId, seconds });
      if (beacon && navigator.sendBeacon) navigator.sendBeacon("/api/public/watch", new Blob([body], { type: "application/json" }));
      else fetch("/api/public/watch", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
    };
    const onSeeking = () => { last = video.currentTime; };
    const onPageHide = () => flush(true);
    const tick = setInterval(() => flush(), 30_000);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("seeking", onSeeking);
    video.addEventListener("pause", onPageHide);
    window.addEventListener("pagehide", onPageHide);

    void playPreroll();
    return () => {
      flush(true);
      clearInterval(tick);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("seeking", onSeeking);
      video.removeEventListener("pause", onPageHide);
      window.removeEventListener("pagehide", onPageHide);
      cancelled = true;
      window.removeEventListener("sf-seek", onSeek);
      hls?.destroy();
    };
  }, [src, videoId, vastTagUrl]);

  return (
    <>
      <video ref={ref} poster={poster ?? undefined} playsInline preload="metadata" controls={!ad}>
        {tracks.map((t, i) => <track key={t.lang} kind="subtitles" srcLang={t.lang} label={t.label} src={t.src} default={i === 0} />)}
      </video>
      {ad && (
        <div style={{ position: "absolute", top: 8, left: 8, right: 8, display: "flex", justifyContent: "space-between", pointerEvents: "none" }}>
          <span style={{ background: "rgba(0,0,0,.7)", color: "#fff", padding: "2px 8px", borderRadius: 4, fontSize: 12 }}>Ad</span>
          {ad.skippable && (
            <button onClick={() => (window as any).__skipAd?.()} style={{ pointerEvents: "auto", background: "rgba(0,0,0,.8)", color: "#fff", border: "1px solid #fff5", padding: "2px 10px", borderRadius: 4 }}>
              Skip ad
            </button>
          )}
        </div>
      )}
      {error && <p style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#fff" }}>{error}</p>}
    </>
  );
}
