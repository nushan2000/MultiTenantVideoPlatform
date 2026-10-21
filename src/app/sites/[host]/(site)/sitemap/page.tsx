import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { tenantDb, tenantTx } from "@/lib/db/client";
import { tagLabel } from "@/lib/media-meta";
import { publicPlaylists } from "@/lib/playlists";
import { parseSiteSeo } from "@/lib/seo";
import { buildPageMetadata, canonicalOrigin } from "@/lib/seo-server";
import { ageGateBlocks, pagesForTenant, tenantForHost } from "@/lib/storefront";
import { parseFeatures } from "@/lib/theme";
import { videoPath } from "@/lib/handles";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ host: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await tenantForHost((await params).host);
  if (!t || (await ageGateBlocks(t))) return {};
  return buildPageMetadata({
    tenant: t, siteSeo: parseSiteSeo(t.seo), origin: await canonicalOrigin(t), path: "/sitemap", title: "Site map",
    description: `Every section, category and recent video on ${t.name}.`,
  });
}

/** Human-readable site map: a few clicks from the footer to every section, category, tag and recent video (crawl depth + usability). */
export default async function SiteMapPage({ params }: Props) {
  const t = await tenantForHost((await params).host);
  if (!t) notFound();
  if (await ageGateBlocks(t)) return null;
  const features = parseFeatures(t.features);
  const db = tenantDb(t.id);
  const [pages, cats, videos, tags, playlists] = await Promise.all([
    pagesForTenant(t),
    features.categories ? db.category.findMany({ orderBy: { name: "asc" }, select: { name: true, slug: true } }) : Promise.resolve([]),
    db.video.findMany({ where: { status: "READY", visibility: "PUBLIC" }, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, title: true, seo: true } }),
    tenantTx(t.id, (tx) => tx.$queryRaw<{ tag: string }[]>`SELECT tag FROM "Video", unnest(tags) AS tag WHERE "tenantId" = ${t.id} AND status = 'READY' AND visibility = 'PUBLIC' GROUP BY tag ORDER BY count(*) DESC LIMIT 100`),
    publicPlaylists(t.id, 100),
  ]);
  const section = (title: string, links: { title: string; href: string }[]) => links.length ? (
    <section style={{ marginBottom: "1.5rem" }}>
      <h2>{title}</h2>
      <ul style={{ paddingLeft: "1.2rem", lineHeight: 1.8 }}>{links.map((l) => <li key={l.href}><Link href={l.href} style={{ color: "var(--primary)" }}>{l.title}</Link></li>)}</ul>
    </section>
  ) : null;
  return (
    <>
      <h1>Site map</h1>
      {section("Main", [{ title: "Home", href: "/" }, { title: "Trending", href: "/trending" }, ...(features.categories ? [{ title: "Categories", href: "/categories" }] : [])])}
      {section("Pages", pages.filter((p) => p.published).map((p) => ({ title: p.title, href: `/${p.slug}` })))}
      {section("Categories", cats.map((c) => ({ title: c.name, href: `/c/${c.slug}` })))}
      {section("Playlists", playlists.map((p) => ({ title: p.title, href: `/playlist/${p.slug}` })))}
      {section("Tags", tags.map(({ tag }) => ({ title: `#${tagLabel(tag)}`, href: `/tag/${tag}` })))}
      {section("Latest videos", videos.map((v) => ({ title: v.title, href: videoPath(v) })))}
    </>
  );
}
