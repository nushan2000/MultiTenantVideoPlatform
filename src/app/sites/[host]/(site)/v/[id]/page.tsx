import type { VideoStatus, Visibility } from "@prisma/client";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { preload } from "react-dom";
import ChapterList from "@/components/ChapterList";
import HlsPlayer from "@/components/HlsPlayer";
import JsonLd from "@/components/JsonLd";
import ReportForm from "@/components/ReportForm";
import ShareButton from "@/components/ShareButton";
import { tenantDb } from "@/lib/db/client";
import { findVideoByRef, videoPath } from "@/lib/handles";
import { parseCaptionsJson, parseChaptersJson, tagLabel } from "@/lib/media-meta";
import { autoDescription, parseJsonLd, parsePageSeo, parseSiteSeo } from "@/lib/seo";
import { absoluteUrl, buildPageMetadata, canonicalOrigin, isoDuration } from "@/lib/seo-server";
import { adsForTenant, mediaUrl, toStoreVideo } from "@/lib/storefront-data";
import { ageGateBlocks, tenantForHost } from "@/lib/storefront";
import { parseFeatures } from "@/lib/theme";
import { getTemplate } from "@/templates/registry";

export const dynamic = "force-dynamic";

// Private videos are never shown on the storefront; unlisted ones work by link only (and are noindexed).
const playable = { status: "READY" as VideoStatus, visibility: { in: ["PUBLIC", "UNLISTED"] as Visibility[] } };

/** 1280px poster (og:image, rich results). Older videos without it fall back server-side to the 640px thumbnail. */
const posterPath = (thumb: string | null) => (thumb ? thumb.replace(/thumb\.jpg$/, "thumb-lg.jpg") : null);

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
  return buildPageMetadata({
    tenant, siteSeo: parseSiteSeo(tenant.seo), origin: await canonicalOrigin(tenant), path: videoPath(video),
    title: vseo.title || video.title,
    description: vseo.description || autoDescription(video.description, `Watch ${video.title} on ${tenant.name}.`),
    keywords: [...vseo.keywords, ...(video.tags as string[]).map(tagLabel), ...(video.category ? [video.category.name] : [])],
    image: vseo.ogImage || mediaUrl(posterPath(video.thumbnailPath)), canonicalUrl: vseo.canonicalUrl,
    noindex: vseo.noindex || video.visibility === "UNLISTED", ogType: "video.other", extraMeta: vseo.extraMeta,
  });
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
  const tags = video.tags as string[];

  // related: shares a tag or the category first, then newest (stronger internal linking than category alone)
  const relatedWhere = { status: "READY" as VideoStatus, visibility: "PUBLIC" as Visibility, id: { not: video.id } };
  const [byTopic, ads, origin] = await Promise.all([
    db.video.findMany({
      where: { ...relatedWhere, OR: [...(tags.length ? [{ tags: { hasSome: tags } }] : []), ...(video.categoryId ? [{ categoryId: video.categoryId }] : [])] },
      orderBy: { createdAt: "desc" }, take: 8, include: { category: { select: { name: true } } },
    }),
    adsForTenant(tenant),
    canonicalOrigin(tenant),
  ]);
  const related = byTopic.length >= 8 ? byTopic : [...byTopic, ...(await db.video.findMany({ where: { ...relatedWhere, id: { notIn: [video.id, ...byTopic.map((v) => v.id)] } }, orderBy: { createdAt: "desc" }, take: 8 - byTopic.length, include: { category: { select: { name: true } } } }))];

  const vseo = parsePageSeo(video.seo);
  const siteSeo = parseSiteSeo(tenant.seo);
  const title = vseo.title || video.title;
  const description = vseo.description || autoDescription(video.description, `Watch ${video.title} on ${tenant.name}.`);
  const poster = mediaUrl(posterPath(video.thumbnailPath));
  const thumbAbs = [absoluteUrl(origin, vseo.ogImage || poster), absoluteUrl(origin, mediaUrl(video.thumbnailPath))].filter(Boolean) as string[];
  const features = parseFeatures(tenant.features);
  const chapters = parseChaptersJson(video.chapters);
  const captions = parseCaptionsJson(video.captions);
  const canonical = vseo.canonicalUrl || `${origin}${videoPath(video)}`;
  const crumbs = [
    { name: "Home", href: "/" },
    ...(features.categories && video.category ? [{ name: video.category.name, href: `/c/${video.category.slug}` }] : []),
    { name: video.title, href: videoPath(video) },
  ];
  if (poster) preload(poster, { as: "image", fetchPriority: "high" }); // the player poster is the LCP element

  return (
    <>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org", "@type": "VideoObject", name: title, description,
            thumbnailUrl: thumbAbs.length ? thumbAbs : undefined, uploadDate: video.createdAt.toISOString(), dateModified: video.updatedAt.toISOString(),
            duration: video.durationSec ? isoDuration(video.durationSec) : undefined,
            url: canonical, embedUrl: `${origin}/embed/${video.id}`, contentUrl: absoluteUrl(origin, mediaUrl(video.hlsPath)),
            inLanguage: (siteSeo.locale ?? "en").replace("_", "-"), isFamilyFriendly: tenant.contentCategory !== "ADULT",
            keywords: [...vseo.keywords, ...tags.map(tagLabel), ...siteSeo.keywords].slice(0, 15).join(", ") || undefined,
            transcript: video.transcript ? (video.transcript as string).slice(0, 5000) : undefined,
            interactionStatistic: { "@type": "InteractionCounter", interactionType: { "@type": "WatchAction" }, userInteractionCount: video.views },
            publisher: { "@type": "Organization", name: siteSeo.organizationName || tenant.name, logo: tenant.logoUrl ? { "@type": "ImageObject", url: absoluteUrl(origin, tenant.logoUrl) } : undefined },
            // chapters become Google "key moments"
            hasPart: chapters.length ? chapters.map((c, i) => ({ "@type": "Clip", name: c.title, startOffset: c.start, endOffset: chapters[i + 1]?.start ?? video.durationSec ?? c.start + 1, url: `${canonical}?t=${c.start}` })) : undefined,
            caption: captions.length ? captions.map((c) => ({ "@type": "MediaObject", inLanguage: c.lang, name: c.label, contentUrl: absoluteUrl(origin, mediaUrl(c.path)), encodingFormat: "text/vtt" })) : undefined,
          },
          { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${origin}${c.href}` })) },
          ...parseJsonLd(vseo.jsonLd),
        ]}
      />
      <T.Watch
        video={toStoreVideo(video)}
        related={related.map(toStoreVideo)}
        features={features}
        breadcrumbs={crumbs}
        tags={tags.map((t) => ({ title: tagLabel(t), href: `/tag/${t}` }))}
        chapters={<ChapterList chapters={chapters} />}
        transcript={video.transcript}
        actions={<ShareButton url={canonical} embedUrl={`${origin}/embed/${video.id}`} title={video.title} />}
        player={<HlsPlayer src={mediaUrl(video.hlsPath)!} poster={poster} videoId={video.id} vastTagUrl={ads.vastTagUrl} tracks={captions.map((c) => ({ lang: c.lang, label: c.label, src: mediaUrl(c.path)! }))} />}
        report={<ReportForm videoId={video.id} />}
      />
    </>
  );
}
