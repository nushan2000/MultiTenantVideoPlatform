import { requireTenant } from "@/lib/access";
import { Card, Flash } from "@/components/ui";
import { videoRef } from "@/lib/handles";
import { parsePageSeo, parseSiteSeo, seoHealth } from "@/lib/seo";
import { tenantPublicOrigin } from "@/lib/seo-server";
import { parseFeatures } from "@/lib/theme";
import HomeSeo from "./HomeSeo";
import PagesTable, { type PageRow } from "./PagesTable";
import SiteSettings from "./SiteSettings";

const ICON = { good: "✓", warn: "!", bad: "✗" } as const;
const COLOR = { good: "text-green-700", warn: "text-amber-700", bad: "text-red-700" } as const;

export default async function SeoHub({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const a = await requireTenant(slug);
  const seo = parseSiteSeo(a.tenant.seo);
  const features = parseFeatures(a.tenant.features);
  const { origin, custom } = await tenantPublicOrigin({ id: a.tenant.id, slug, planKey: a.planKey });
  const [videos, categories] = await Promise.all([
    a.db.video.findMany({ where: { status: "READY" }, orderBy: { createdAt: "desc" }, take: 300, select: { id: true, title: true, description: true, thumbnailPath: true, seo: true } }),
    a.db.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  const health = seoHealth({
    seo, siteName: a.tenant.name, hasLogo: !!a.tenant.logoUrl, hasFavicon: !!a.tenant.faviconUrl, hasActiveCustomDomain: custom, noindex: features.noindex,
    videos: {
      total: videos.length, withDescription: videos.filter((v) => (v.description ?? "").trim().length >= 30 || !!parsePageSeo(v.seo).description).length,
      withThumbnail: videos.filter((v) => !!v.thumbnailPath).length, customSeo: videos.filter((v) => { const s = parsePageSeo(v.seo); return !!(s.title || s.description); }).length,
    },
    categories: { total: categories.length, withSeo: categories.filter((c) => { const s = parsePageSeo(c.seo); return !!(s.title && s.description); }).length },
  });
  const bar = health.score >= 80 ? "bg-green-600" : health.score >= 50 ? "bg-amber-500" : "bg-red-500";
  const template = seo.titleTemplate || `%s · ${a.tenant.name}`;

  const rows: PageRow[] = [
    ...categories.map((c): PageRow => ({ kind: "category", id: c.id, name: c.name, ref: c.slug, description: "", seo: parsePageSeo(c.seo) })),
    ...videos.map((v): PageRow => ({ kind: "video", id: v.id, name: v.title, ref: videoRef(v), description: v.description ?? "", seo: parsePageSeo(v.seo) })),
  ];

  return (
    <>
      <Flash ok={sp.ok} error={sp.error} />

      <Card title="SEO health">
        <div className="mb-3 flex items-center gap-3">
          <div className="text-3xl font-bold">{health.score}<span className="text-base font-normal text-neutral-500">/100</span></div>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-neutral-200"><div className={`h-full ${bar}`} style={{ width: `${health.score}%` }} /></div>
        </div>
        <ul className="space-y-1 text-sm">
          {health.items.map((i) => <li key={i.id} className={COLOR[i.level]}><span className="mr-2 font-bold">{ICON[i.level]}</span>{i.message}</li>)}
        </ul>
        <p className="mt-3 text-xs text-neutral-500">
          Every page already ships with a unique title, description, canonical URL, Open Graph + Twitter cards, structured data (WebSite, Organization, VideoObject, BreadcrumbList),
          a video sitemap and robots.txt. Edit any page&apos;s search listing below (or from the video / category itself) to override the automatic values.
        </p>
      </Card>

      <Card title="Sitemap & search engines">
        <p className="mb-1 text-sm">Submit this sitemap in Google Search Console and Bing Webmaster Tools:</p>
        <p className="mb-2 break-all font-mono text-sm">{origin}/sitemap.xml</p>
        <p className="text-sm text-neutral-600">robots.txt: <span className="font-mono">{origin}/robots.txt</span>.
          {custom ? " Your custom domain is the canonical address." : " On Premium, a custom domain becomes the canonical address."}</p>
      </Card>

      <HomeSeo tenantId={a.tenant.id} origin={origin} siteName={a.tenant.name} homeTitle={seo.homeTitle ?? ""} homeDescription={seo.homeDescription ?? ""} noindex={features.noindex} />

      <PagesTable rows={rows} origin={origin} siteName={a.tenant.name} template={template} slug={slug} tenantId={a.tenant.id} />

      <SiteSettings
        tenantId={a.tenant.id} siteName={a.tenant.name} faviconUrl={a.tenant.faviconUrl}
        initial={{
          titleTemplate: seo.titleTemplate ?? "", keywords: seo.keywords.join(", "), organizationName: seo.organizationName ?? "", locale: seo.locale ?? "",
          twitterHandle: seo.twitterHandle ?? "", googleVerification: seo.googleVerification ?? "", bingVerification: seo.bingVerification ?? "",
          socials: seo.socials.join("\n"), ogImage: seo.ogImage ?? "",
          extraMeta: seo.extraMeta.map((m) => `${m.name}: ${m.content}`).join("\n"), jsonLd: seo.jsonLd ?? "",
        }}
      />
    </>
  );
}
