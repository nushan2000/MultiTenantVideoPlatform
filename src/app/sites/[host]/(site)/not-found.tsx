import type { Metadata } from "next";
import Link from "next/link";

// A real 404 status (Next sets it) with a useful, branded page: search + the main sections, never indexed.
export const metadata: Metadata = { title: "Page not found", robots: { index: false, follow: true } };

export default function SiteNotFound() {
  return (
    <section style={{ maxWidth: "36rem", padding: "2rem 0" }}>
      <h1>We couldn&apos;t find that page</h1>
      <p>The video or page may have been moved or removed. Try searching, or head to one of these:</p>
      <form action="/search" role="search" style={{ display: "flex", gap: ".5rem", margin: "1rem 0" }}>
        <input name="q" placeholder="Search videos" aria-label="Search" maxLength={100} style={{ flex: 1, padding: ".5rem .7rem", border: "1px solid #9994", borderRadius: "var(--radius)", background: "var(--bg)", color: "var(--text)" }} />
        <button className="sf-btn" type="submit">Search</button>
      </form>
      <p style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
        <Link className="sf-chip" href="/">Home</Link>
        <Link className="sf-chip" href="/trending">Trending</Link>
        <Link className="sf-chip" href="/categories">Categories</Link>
        <Link className="sf-chip" href="/sitemap">Site map</Link>
      </p>
    </section>
  );
}
