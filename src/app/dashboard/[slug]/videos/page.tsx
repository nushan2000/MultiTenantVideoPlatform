import { requireTenant } from "@/lib/access";
import { tenantPublicOrigin } from "@/lib/seo-server";
import { serializeVideo } from "@/lib/api";
import { formatChapters, parseCaptionsJson, parseChaptersJson } from "@/lib/media-meta";
import { Flash } from "@/components/ui";
import UploadPanel from "./UploadPanel";
import VideoList from "./VideoList";

export default async function Videos({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const a = await requireTenant(slug);
  const [videos, categories] = await Promise.all([
    a.db.video.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
    a.db.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const rows = videos.map((v) => {
    const s = serializeVideo(v);
    return {
      id: s.id, title: s.title, description: s.description, status: s.status, visibility: s.visibility, featured: s.featured,
      categoryId: s.categoryId, ingestMethod: s.ingestMethod, sourceUrl: s.sourceUrl, failureReason: s.failureReason,
      importProgress: s.importProgress, seo: s.seo as Record<string, unknown>,
      tags: s.tags as string[], chapters: formatChapters(parseChaptersJson(s.chapters)), transcript: (s.transcript as string | null) ?? "", captions: parseCaptionsJson(s.captions).map((c) => ({ lang: c.lang, label: c.label })), thumb: s.thumbnailPath ?? "", publishAt: s.publishAt ? s.publishAt.toISOString() : null, likes: s.likes, durationSec: s.durationSec, views: s.views, createdAt: s.createdAt.toISOString(),
    };
  });
  return (
    <>
      <Flash ok={sp.ok} error={sp.error} />
      <UploadPanel
        tenantId={a.tenant.id}
        limits={{
          maxUploadBytes: a.ent.maxUploadBytes,
          canUseUrlImport: a.ent.canUseUrlImport,
          maxImportBatch: a.ent.maxImportBatch,
        }}
      />
      <VideoList initial={rows} categories={categories} site={{ name: a.tenant.name, origin: (await tenantPublicOrigin({ id: a.tenant.id, slug, planKey: a.planKey })).origin }} />
    </>
  );
}
