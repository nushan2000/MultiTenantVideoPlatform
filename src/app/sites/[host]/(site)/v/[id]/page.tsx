import type { VideoStatus, Visibility } from "@prisma/client";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import HlsPlayer from "@/components/HlsPlayer";
import JsonLd from "@/components/JsonLd";
import ReportForm from "@/components/ReportForm";
import { tenantDb } from "@/lib/db/client";
import { findVideoByRef, videoPath } from "@/lib/handles";
import { autoDescription, parsePageSeo, parseSiteSeo } from "@/lib/seo";
import { absoluteUrl, buildPageMetadata, canonicalOrigin, isoDuration } from "@/lib/seo-server";
import { adsForTenant, mediaUrl, toStoreVideo } from "@/lib/storefront-data";
import { ageGateBlocks, tenantForHost } from "@/lib/storefront";
import { parseFeatures } from "@/lib/theme";
import { getTemplate } from "@/templates/registry";

export const dynamic = "force-dynamic";

// Private videos are never shown on the storefront; unlisted ones work by link only (and are noindexed).
const playable = { status: "READY" as VideoStatus, visibility: { in: ["PUBLIC", "UNLISTED"] as Visibility[] } };

/** `id` is whatever is in the URL: a handle, a retired handle (redirects), or a raw id (redirects when a handle exists). */
async function load(host: string, ref: string) {
  const tenant = await tenantForHost(host);
  if (!tenant) return null;
  const hit = await findVideoByRef<any>(tenantDb(tenant.id), ref, playable, { category: { select: { name: true, slug: true } } });
  return hit ? { tenant, video: hit.video, redirect: hit.redirect } : null;
}

export async function generateMetadata({ params }: { params: Promise<{ host: string; id: string }> }): Promise<Metadata> {
  const { host, id } = await params;
  const d = await load(host, id);
  if (!d || (await ageGateBlocks(d.tenant))) return {}; // no titles/thumbnails in metadata before the gate
  const { tenant, video } = d;
  const vseo = parsePageSeo(video.seo);
  const siteSeo = parseSiteSeo(tenant.seo);
  const meta = buildPageMetadata({
    tenant, siteSeo, origin: await canonicalOrigin(tenant), path: videoPath(video),
    title: vseo.title || video.title,
    description: vseo.description || autoDescription(video.description, `Watch ${video.title} on ${tenant.name}.`),
    keywords: [...vseo.keywords, ...(video.category ? [video.category.name] : [])],
    image: vseo.ogImage || mediaUrl(video.thumbnailPath), canonicalUrl: vseo.canonicalUrl,
    noindex: vseo.noindex || video.visibility === "UNLISTED", ogType: "video.other",
  });
  return meta;
}

export default async function Watch({ params }: { params: Promise<{ host: string; id: string }> }) {
  const { host, id } = await params;
  const d = await load(host, id);
  if (!d) notFound();
  const { tenant, video } = d;
  if (d.redirect) permanentRedirect(videoPath(video)); // old handle / raw id -> canonical URL (308)
  if (await ageGateBlocks(tenant)) return null;
  const T = getTemplate(tenant.templateId);
  const db = tenantDb(tenant.id);

  const [related, ads, origin] = await Promise.all([
    db.video.findMany({
      where: { status: "READY", visibility: "PUBLIC", id: { not: id }, ...(video.categoryId ? { categoryId: video.categoryId } : {}) },
      orderBy: { createdAt: "desc" }, take: 8, include: { category: { select: { name: true } } },
    }),
    adsForTenant(tenant),
    canonicalOrigin(tenant),
  ]);
  const vseo = parsePageSeo(video.seo);
  const siteSeo = parseSiteSeo(tenant.seo);
  const title = vseo.title || video.title;
  const description = vseo.description || autoDescription(video.description, `Watch ${video.title} on ${tenant.name}.`);
  const thumb = absoluteUrl(origin, vseo.ogImage || mediaUrl(video.thumbnailPath));
  const features = parseFeatures(tenant.features);
  const crumbs = [
    { name: "Home", href: "/" },
    ...(features.categories && video.category ? [{ name: video.category.name, href: `/c/${video.category.slug}` }] : []),
    { name: video.title, href: videoPath(video) },
  ];

  return (
    <>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org", "@type": "VideoObject", name: title, description,
            thumbnailUrl: thumb ? [thumb] : undefined, uploadDate: video.createdAt.toISOString(),
            duration: video.durationSec ? isoDuration(video.durationSec) : undefined,
            url: vseo.canonicalUrl || `${origin}${videoPath(video)}`, embedUrl: `${origin}/embed/${video.id}`,
            inLanguage: (siteSeo.locale ?? "en").replace("_", "-"), isFamilyFriendly: tenant.contentCategory !== "ADULT",
            keywords: [...vseo.keywords, ...siteSeo.keywords].slice(0, 15).join(", ") || undefined,
            interactionStatistic: { "@type": "InteractionCounter", interactionType: { "@type": "WatchAction" }, userInteractionCount: video.views },
            publisher: { "@type": "Organization", name: siteSeo.organizationName || tenant.name, logo: tenant.logoUrl ? { "@type": "ImageObject", url: absoluteUrl(origin, tenant.logoUrl) } : undefined },
          },
          { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${origin}${c.href}` })) },
        ]}
      />
      <T.Watch
        video={toStoreVideo(video)}
        related={related.map(toStoreVideo)}
        features={features}
        breadcrumbs={crumbs}
        player={<HlsPlayer src={mediaUrl(video.hlsPath)!} poster={mediaUrl(video.thumbnailPath)} videoId={video.id} vastTagUrl={ads.vastTagUrl} />}
        report={<ReportForm videoId={video.id} />}
      />
    </>
  );
}
