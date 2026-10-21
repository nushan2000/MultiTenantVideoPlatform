"use client";

import { useEffect, useState } from "react";

const storeKey = (id: string) => `liked:${id}`;

/** Anonymous like toggle. The server de-duplicates per visitor; localStorage only remembers the filled-in state for this browser. */
export default function LikeButton({ videoId, initialLikes }: { videoId: string; initialLikes: number }) {
  const [likes, setLikes] = useState(initialLikes);
  const [liked, setLiked] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try { setLiked(localStorage.getItem(storeKey(videoId)) === "1"); } catch { /* private mode */ }
  }, [videoId]);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const res = await fetch("/api/public/like", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ videoId }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return;
    const data = await res.json();
    setLikes(data.likes);
    setLiked(data.liked);
    try { data.liked ? localStorage.setItem(storeKey(videoId), "1") : localStorage.removeItem(storeKey(videoId)); } catch { /* ignore */ }
  }

  return (
    <button type="button" className="sf-chip" onClick={toggle} aria-pressed={liked} disabled={busy} title={liked ? "Remove your like" : "Like this video"}>
      {liked ? "♥" : "♡"} {likes.toLocaleString("en-US")}
    </button>
  );
}
