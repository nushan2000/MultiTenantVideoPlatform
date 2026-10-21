import type { Metadata } from "next";
import { requireTenant } from "@/lib/access";
import { Card } from "@/components/ui";
import { tenantPublicOrigin } from "@/lib/seo-server";
import PlaylistsManager, { type PlaylistDTO } from "./PlaylistsManager";

export const metadata: Metadata = { title: "Playlists" };

export default async function PlaylistsTab({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = await requireTenant(slug);
  const { origin } = await tenantPublicOrigin({ id: a.tenant.id, slug, planKey: a.planKey });
  const [playlists, videos] = await Promise.all([
    a.db.playlist.findMany({ orderBy: [{ position: "asc" }, { createdAt: "asc" }], include: { items: { orderBy: { position: "asc" }, select: { videoId: true } } } }),
    a.db.video.findMany({ where: { status: "READY" }, orderBy: { createdAt: "desc" }, take: 500, select: { id: true, title: true, visibility: true } }),
  ]);
  const dto: PlaylistDTO[] = playlists.map((p) => ({ id: p.id, title: p.title, slug: p.slug, description: p.description ?? "", published: p.published, videoIds: p.items.map((i) => i.videoId) }));
  return (
    <>
      <Card>
        <p className="text-sm text-neutral-700">
          Playlists are hand-picked, ordered lists of videos, like a series, a course or a &quot;start here&quot; collection. Each one gets its own page (<code>/playlist/your-name</code>), a footer link and a sitemap entry.
          Only public videos are shown to visitors.
        </p>
      </Card>
      <PlaylistsManager tenantId={a.tenant.id} origin={origin} playlists={dto} videos={videos.map((v) => ({ id: v.id, title: v.title, visibility: v.visibility }))} />
    </>
  );
}
