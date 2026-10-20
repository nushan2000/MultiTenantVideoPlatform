"use client";

import { formatTimestamp } from "@/lib/media-meta";

export const SEEK_EVENT = "sf-seek";

/** Chapters ("key moments"). Real buttons for users; the same data is in the VideoObject JSON-LD (Clip) for Google's key-moments feature. */
export default function ChapterList({ chapters }: { chapters: { start: number; title: string }[] }) {
  if (!chapters.length) return null;
  return (
    <section className="sf-chapters" aria-label="Chapters">
      <h2 style={{ fontSize: "1rem", margin: 0 }}>Chapters</h2>
      <ol>
        {chapters.map((c) => (
          <li key={c.start}>
            <button type="button" onClick={() => { window.dispatchEvent(new CustomEvent(SEEK_EVENT, { detail: c.start })); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
              <span className="t">{formatTimestamp(c.start)}</span>{c.title}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
