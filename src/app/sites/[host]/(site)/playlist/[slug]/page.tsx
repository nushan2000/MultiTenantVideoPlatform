import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import { playlistData } from "@/lib/playlists";
import { parseSiteSeo } from "@/lib/seo";
import { buildPageMetadata, canonicalOrigin } from "@/lib/seo-server";
import { ageGateBlocks, tenantForHost } from "@/lib/storefront";
import { getTemplate } from "@/templates/registry";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ host: string; slug: string }> };

async function load(host: string, slug: string) {
  const tenant = await tenantForHost(host);
  if (!tenant) return null;
  const data = await playlistData(tenant, slug);
  return data && data.videos.length > 0 ? { tenant, ...data } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { host, slug } = await params;
  const d = await load(host, slug);
  if (!d || (await ageGateBlocks(d.tenant))) return {};
  return buildPageMetadata({
    tenant: d.tenant, siteSeo: parseSiteSeo(d.tenant.seo), origin: await canonicalOrigin(d.tenant), path: `/playlist/${slug}`,
    title: d.playlist.title,
    description: d.playlist.description || `${d.videos.length} video${d.videos.length === 1 ? "" : "s"} in the ${d.playlist.title} playlist on ${d.tenant.name}.`,
    noindex: d.videos.length < 2, // a one-video playlist is thin content
  });
}

export default async function PlaylistPage({ params }: Props) {
  const { host, slug } = await params;
  const d = await load(host, slug);
  if (!d) notFound();
  if (await ageGateBlocks(d.tenant)) return null;
  const origin = await canonicalOrigin(d.tenant);
  const T = getTemplate(d.tenant.templateId);
  const crumbs = [{ name: "Home", href: "/" }, { name: d.playlist.title, href: `/playlist/${slug}` }];
  return (
    <>
      <JsonLd
        data={[
          { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${origin}${c.href}` })) },
          { "@context": "https://schema.org", "@type": "ItemList", name: d.playlist.title, itemListElement: d.videos.map((v, i) => ({ "@type": "ListItem", position: i + 1, url: `${origin}${v.href}`, name: v.title })) },
        ]}
      />
      <T.Listing heading={d.playlist.title} intro={d.playlist.description} breadcrumbs={crumbs} videos={d.videos} emptyText="No videos in this playlist yet." />
    </>
  );
}
