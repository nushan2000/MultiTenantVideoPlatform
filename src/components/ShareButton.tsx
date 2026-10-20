"use client";

import { useState } from "react";

/** YouTube-style Share: copy link, copy embed code, share to common networks. Gives owners backlinks and viewers an easy way to spread videos. */
export default function ShareButton({ url, embedUrl, title }: { url: string; embedUrl: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<"link" | "embed" | null>(null);
  const embedCode = `<iframe src="${embedUrl}" width="640" height="360" frameborder="0" allow="fullscreen" allowfullscreen title="${title.replace(/"/g, "&quot;")}"></iframe>`;
  const enc = encodeURIComponent;

  async function copy(text: string, what: "link" | "embed") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* clipboard blocked: the field is selectable */
    }
  }
  const nets: [string, string][] = [
    ["X", `https://twitter.com/intent/tweet?url=${enc(url)}&text=${enc(title)}`],
    ["Facebook", `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`],
    ["WhatsApp", `https://wa.me/?text=${enc(`${title} ${url}`)}`],
    ["Reddit", `https://www.reddit.com/submit?url=${enc(url)}&title=${enc(title)}`],
    ["Email", `mailto:?subject=${enc(title)}&body=${enc(url)}`],
  ];

  return (
    <div className="sf-share">
      <button type="button" className="sf-btn" aria-expanded={open} onClick={() => setOpen(!open)}>Share</button>
      {open && (
        <div className="sf-share-panel" role="dialog" aria-label="Share this video">
          <label className="sf-meta" htmlFor="sf-share-link">Link</label>
          <div style={{ display: "flex", gap: ".4rem", margin: ".25rem 0 .75rem" }}>
            <input id="sf-share-link" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="sf-btn" onClick={() => copy(url, "link")}>{copied === "link" ? "Copied" : "Copy"}</button>
          </div>
          <label className="sf-meta" htmlFor="sf-share-embed">Embed</label>
          <textarea id="sf-share-embed" readOnly rows={3} value={embedCode} onFocus={(e) => e.currentTarget.select()} style={{ margin: ".25rem 0" }} />
          <button type="button" className="sf-btn" onClick={() => copy(embedCode, "embed")}>{copied === "embed" ? "Copied" : "Copy embed code"}</button>
          <div className="sf-share-links">
            {nets.map(([name, href]) => <a key={name} className="sf-chip" href={href} target="_blank" rel="noopener noreferrer">{name}</a>)}
          </div>
        </div>
      )}
    </div>
  );
}
