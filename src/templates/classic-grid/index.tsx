import Link from "next/link";
import { FONTS, themeToCssVars } from "@/lib/theme";
import type { CategoriesProps, Crumb, HomeProps, ListingProps, NavLink, PageProps, Pagination, ShellProps, StoreVideo, Template, WatchProps } from "../types";
import { css } from "./styles";

const fmtDuration = (s: number | null) => {
  if (!s) return "";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};
const fmtViews = (n: number) => `${n.toLocaleString("en-US")} view${n === 1 ? "" : "s"}`;
const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

function Card({ v, priority }: { v: StoreVideo; priority?: boolean }) {
  return (
    <Link href={v.href} className="sf-card">
      <div className="sf-thumb">
        {v.thumbUrl ? (
          // first row loads eagerly with high priority (LCP); the rest lazily
          <img src={v.thumbUrl} alt={v.title} width={320} height={180} loading={priority ? "eager" : "lazy"} decoding="async" {...(priority ? { fetchPriority: "high" as const } : {})} />
        ) : null}
        {v.durationSec ? <span className="sf-dur">{fmtDuration(v.durationSec)}</span> : null}
      </div>
      <div className="sf-title">{v.title}</div>
      <div className="sf-meta">
        {fmtViews(v.views)} · {fmtDate(v.createdAt)}
        {v.categoryName ? ` · ${v.categoryName}` : ""}
      </div>
    </Link>
  );
}

function Grid({ videos, eager = 0 }: { videos: StoreVideo[]; eager?: number }) {
  return <div className="sf-grid">{videos.map((v, i) => <Card key={v.id} v={v} priority={i < eager} />)}</div>;
}

function Crumbs({ items }: { items?: Crumb[] }) {
  if (!items?.length) return null;
  return (
    <nav aria-label="Breadcrumb" className="sf-meta" style={{ marginBottom: ".75rem" }}>
      {items.map((c, i) => (
        <span key={c.href}>
          {i > 0 ? " › " : ""}
          {i < items.length - 1 ? <Link href={c.href}>{c.name}</Link> : <span aria-current="page">{c.name}</span>}
        </span>
      ))}
    </nav>
  );
}

function Chips({ items }: { items?: NavLink[] }) {
  if (!items?.length) return null;
  return (
    <nav aria-label="Categories" className="sf-chips">
      {items.map((c) => <Link key={c.href} href={c.href} className="sf-chip">{c.title}</Link>)}
    </nav>
  );
}

/** Plain links so crawlers can walk every page of a list (rel=prev/next are also emitted in <head>). */
function Pager({ p }: { p?: Pagination }) {
  if (!p || p.totalPages <= 1) return null;
  const pages = Array.from({ length: p.totalPages }, (_, i) => i + 1).filter((n) => n === 1 || n === p.totalPages || Math.abs(n - p.page) <= 2);
  return (
    <nav aria-label="Pagination" className="sf-pager">
      {p.page > 1 && <Link href={p.hrefFor(p.page - 1)} rel="prev">‹ Previous</Link>}
      {pages.map((n, i) => (
        <span key={n}>
          {i > 0 && n - pages[i - 1] > 1 ? <span className="sf-meta"> … </span> : null}
          {n === p.page ? <strong aria-current="page" className="sf-chip sf-chip-on">{n}</strong> : <Link href={p.hrefFor(n)} className="sf-chip">{n}</Link>}
        </span>
      ))}
      {p.page < p.totalPages && <Link href={p.hrefFor(p.page + 1)} rel="next">Next ›</Link>}
    </nav>
  );
}

function Shell({ tenant, theme, features, navLinks, footer, showBadge, allowCustomCss, searchQuery, banner, bare, lang, children }: ShellProps) {
  // The vars string is built only from validated enums/hex/ints (see lib/theme). Custom CSS is premium-only AND validated at save time.
  const vars = themeToCssVars(theme);
  const custom = allowCustomCss ? theme.customCss : "";
  if (bare) {
    return (
      <div className="sf" lang={lang} style={{ fontFamily: FONTS[theme.font] }}>
        <style dangerouslySetInnerHTML={{ __html: `${css}.sf{${vars}}` }} />
        {children}
      </div>
    );
  }
  return (
    <div className="sf" lang={lang} style={{ fontFamily: FONTS[theme.font] }}>
      <style dangerouslySetInnerHTML={{ __html: `${css}.sf{${vars}}${custom}` }} />
      <a href="#main" className="sf-skip">Skip to content</a>
      <header className="sf-header">
        <div className="sf-wrap">
          <Link href="/" className="sf-brand">
            {tenant.logoUrl ? <img src={tenant.logoUrl} alt={`${tenant.name} logo`} height={32} /> : null}
            <span>{tenant.name}</span>
          </Link>
          {features.search && (
            <form action="/search" className="sf-search" role="search">
              <input name="q" defaultValue={searchQuery} placeholder="Search videos" aria-label="Search" maxLength={100} />
              <button className="sf-btn" type="submit">Search</button>
            </form>
          )}
          <nav className="sf-nav" aria-label="Main">
            {navLinks.map((l) => <Link key={l.href} href={l.href}>{l.title}</Link>)}
          </nav>
        </div>
      </header>
      <main className="sf-main" id="main">
        <div className="sf-wrap">
          {banner ? <div className="sf-banner" dangerouslySetInnerHTML={{ __html: banner }} /> : null}
          {children}
        </div>
      </main>
      <footer className="sf-footer">
        <div className="sf-wrap">
          <div className="sf-footgrid">
            {footer.map((g) => (
              <nav key={g.title} aria-label={g.title}>
                <h2 className="sf-foothead">{g.title}</h2>
                <ul>{g.links.map((l) => <li key={l.href}><Link href={l.href}>{l.title}</Link></li>)}</ul>
              </nav>
            ))}
          </div>
          <div className="sf-footbar">
            <span>© {new Date().getFullYear()} {tenant.name}</span>
            {showBadge ? <span className="sf-badge">Powered by <a href="/">VideoPlatform</a></span> : null}
          </div>
        </div>
      </footer>
    </div>
  );
}

function Home({ heading, intro, chips, featured, latest, pagination }: HomeProps) {
  return (
    <>
      <h1>{heading}</h1>
      {intro ? <p className="sf-desc" style={{ marginTop: 0 }}>{intro}</p> : null}
      <Chips items={chips} />
      {featured.length > 0 && (!pagination || pagination.page === 1) && (
        <>
          <h2>Featured videos</h2>
          <Grid videos={featured} eager={4} />
        </>
      )}
      <h2>Latest videos</h2>
      {latest.length ? <Grid videos={latest} eager={featured.length ? 0 : 4} /> : <p className="sf-empty">No videos yet.</p>}
      <Pager p={pagination} />
    </>
  );
}

function Listing({ heading, intro, videos, emptyText, breadcrumbs, pagination, chips }: ListingProps) {
  return (
    <>
      <Crumbs items={breadcrumbs} />
      <h1>{heading}</h1>
      {intro ? <p className="sf-desc" style={{ marginTop: 0 }}>{intro}</p> : null}
      <Chips items={chips} />
      {videos.length ? <Grid videos={videos} eager={4} /> : <p className="sf-empty">{emptyText}</p>}
      <Pager p={pagination} />
    </>
  );
}

function Categories({ categories }: CategoriesProps) {
  return (
    <>
      <Crumbs items={[{ name: "Home", href: "/" }, { name: "Categories", href: "/categories" }]} />
      <h1>Categories</h1>
      {categories.length ? (
        <div className="sf-grid">
          {categories.map((c) => (
            <Link key={c.href} href={c.href} className="sf-card">
              <div className="sf-thumb">{c.thumbUrl ? <img src={c.thumbUrl} alt={c.name} width={320} height={180} loading="lazy" decoding="async" /> : null}</div>
              <div className="sf-title">{c.name}</div>
              <div className="sf-meta">{c.count} video{c.count === 1 ? "" : "s"}</div>
            </Link>
          ))}
        </div>
      ) : <p className="sf-empty">No categories yet.</p>}
    </>
  );
}

function Page({ title, html, breadcrumbs, updated }: PageProps) {
  return (
    <article className="sf-article">
      <Crumbs items={breadcrumbs} />
      <h1>{title}</h1>
      <div className="sf-prose" dangerouslySetInnerHTML={{ __html: html }} />
      {updated ? <p className="sf-meta" style={{ marginTop: "2rem" }}>Last updated {fmtDate(updated)}</p> : null}
    </article>
  );
}

function Watch({ video, related, player, actions, report, breadcrumbs, tags, chapters, transcript }: WatchProps) {
  const desc = video.description?.trim() ?? "";
  return (
    <div className="sf-watch">
      <div>
        <Crumbs items={breadcrumbs} />
        <div className="sf-player">{player}</div>
        <h1 style={{ marginTop: "1rem" }}>{video.title}</h1>
        <div className="sf-actions">
          <div className="sf-meta">
            {fmtViews(video.views)} · <time dateTime={video.createdAt.toISOString()}>{fmtDate(video.createdAt)}</time>
            {video.categoryName ? ` · ${video.categoryName}` : ""}
          </div>
          {actions}
        </div>
        {desc ? (
          // the full text is always in the HTML (crawlers read it); <details> only collapses it visually
          <details className="sf-more">
            <summary>{desc.length > 160 ? `${desc.slice(0, 160).replace(/\s+\S*$/, "")}… ` : desc}{desc.length > 160 ? <span className="sf-link">Show more</span> : null}</summary>
            {desc.length > 160 ? <p className="sf-desc">{desc}</p> : null}
          </details>
        ) : null}
        {tags.length ? <div className="sf-tags">{tags.map((t) => <Link key={t.href} href={t.href} className="sf-chip">#{t.title}</Link>)}</div> : null}
        {chapters}
        {transcript ? (
          <details className="sf-more" style={{ marginTop: "1rem" }}>
            <summary><strong>Transcript</strong> <span className="sf-link">Show</span></summary>
            <p className="sf-desc">{transcript}</p>
          </details>
        ) : null}
        {report}
      </div>
      <aside>
        <h2 style={{ marginTop: 0 }}>Up next</h2>
        <div className="sf-related">{related.map((v) => <Card key={v.id} v={v} />)}</div>
      </aside>
    </div>
  );
}

export const classicGrid: Template = { id: "classic-grid", name: "Classic grid", Shell, Home, Listing, Categories, Page, Watch };
