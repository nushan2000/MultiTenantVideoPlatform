import Link from "next/link";
import { FONTS, themeToCssVars } from "@/lib/theme";
import type { Crumb, HomeProps, ListingProps, ShellProps, StoreVideo, Template, WatchProps } from "../types";
import { css } from "./styles";

const fmtDuration = (s: number | null) => {
  if (!s) return "";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};
const fmtViews = (n: number) => `${n.toLocaleString("en-US")} view${n === 1 ? "" : "s"}`;

function Card({ v }: { v: StoreVideo }) {
  return (
    <Link href={v.href} className="sf-card">
      <div className="sf-thumb">
        {v.thumbUrl ? <img src={v.thumbUrl} alt={v.title} width={320} height={180} loading="lazy" decoding="async" /> : null}
        {v.durationSec ? <span className="sf-dur">{fmtDuration(v.durationSec)}</span> : null}
      </div>
      <div className="sf-title">{v.title}</div>
      <div className="sf-meta">
        {fmtViews(v.views)}
        {v.categoryName ? ` · ${v.categoryName}` : ""}
      </div>
    </Link>
  );
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

function Shell({ tenant, theme, features, categories, showBadge, allowCustomCss, searchQuery, banner, bare, lang, children }: ShellProps) {
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
      <header className="sf-header">
        <div className="sf-wrap">
          <Link href="/" className="sf-brand">
            {tenant.logoUrl ? <img src={tenant.logoUrl} alt={`${tenant.name} logo`} height={32} /> : null}
            <span>{tenant.name}</span>
          </Link>
          <nav className="sf-nav">
            {features.categories &&
              categories.map((c) => (
                <Link key={c.slug} href={`/c/${c.slug}`}>
                  {c.name}
                </Link>
              ))}
          </nav>
          {features.search && (
            <form action="/search" className="sf-search" role="search">
              <input name="q" defaultValue={searchQuery} placeholder="Search videos" aria-label="Search" maxLength={100} />
              <button className="sf-btn" type="submit">
                Search
              </button>
            </form>
          )}
        </div>
      </header>
      <main className="sf-main">
        <div className="sf-wrap">
          {banner ? <div className="sf-banner" dangerouslySetInnerHTML={{ __html: banner }} /> : null}
          {children}
        </div>
      </main>
      <footer className="sf-footer">
        <div className="sf-wrap">
          <span>© {new Date().getFullYear()} {tenant.name}</span>
          {showBadge ? (
            <span className="sf-badge">
              Powered by <a href="/">VideoPlatform</a>
            </span>
          ) : null}
        </div>
      </footer>
    </div>
  );
}

function Home({ heading, intro, featured, latest }: HomeProps) {
  return (
    <>
      <h1>{heading}</h1>
      {intro ? <p className="sf-desc" style={{ marginTop: 0 }}>{intro}</p> : null}
      {featured.length > 0 && (
        <>
          <h2>Featured videos</h2>
          <div className="sf-grid">{featured.map((v) => <Card key={v.id} v={v} />)}</div>
        </>
      )}
      <h2>Latest videos</h2>
      {latest.length ? <div className="sf-grid">{latest.map((v) => <Card key={v.id} v={v} />)}</div> : <p className="sf-empty">No videos yet.</p>}
    </>
  );
}

function Listing({ heading, intro, videos, emptyText, breadcrumbs }: ListingProps) {
  return (
    <>
      <Crumbs items={breadcrumbs} />
      <h1>{heading}</h1>
      {intro ? <p className="sf-desc" style={{ marginTop: 0 }}>{intro}</p> : null}
      {videos.length ? <div className="sf-grid">{videos.map((v) => <Card key={v.id} v={v} />)}</div> : <p className="sf-empty">{emptyText}</p>}
    </>
  );
}

function Watch({ video, related, player, report, banner, breadcrumbs }: WatchProps) {
  return (
    <div className="sf-watch">
      <div>
        <Crumbs items={breadcrumbs} />
        <div className="sf-player">{player}</div>
        <h1 style={{ marginTop: "1rem" }}>{video.title}</h1>
        <div className="sf-meta">
          {fmtViews(video.views)}
          {video.categoryName ? ` · ${video.categoryName}` : ""} · {video.createdAt.toISOString().slice(0, 10)}
        </div>
        {video.description ? <p className="sf-desc">{video.description}</p> : null}
        {banner ? <div className="sf-banner" dangerouslySetInnerHTML={{ __html: banner }} /> : null}
        {report}
      </div>
      <aside>
        <h2 style={{ marginTop: 0 }}>Related videos</h2>
        <div className="sf-related">{related.map((v) => <Card key={v.id} v={v} />)}</div>
      </aside>
    </div>
  );
}

export const classicGrid: Template = { id: "classic-grid", name: "Classic grid", Shell, Home, Listing, Watch };
