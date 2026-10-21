import { apiTenant } from "@/lib/access";
import { route } from "@/lib/api";
import { audit } from "@/lib/audit";
import { platformDb, tenantTx } from "@/lib/db/client";
import { HttpError } from "@/lib/ingest/types";
import { playlistPatch } from "@/lib/playlists";
import { notifyPaths } from "@/lib/seo-notify";
import { invalidateTenant } from "@/lib/tenancy/resolve";

async function load(id: string) {
  const row = await platformDb.playlist.findUnique({ where: { id }, select: { tenantId: true } });
  if (!row) throw new HttpError(404, "Playlist not found", "not_found");
  const a = await apiTenant(row.tenantId, ["OWNER", "ADMIN", "EDITOR"]);
  const playlist = await a.db.playlist.findFirst({ where: { id } });
  if (!playlist) throw new HttpError(404, "Playlist not found", "not_found");
  return { a, playlist };
}

// PATCH /api/playlists/:id: title / description / published / slug, and `videoIds` = the complete ordered list of videos
export const PATCH = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const input = playlistPatch.parse(await req.json());
  const { a, playlist } = await load(id);
  const tenantId = a.tenant.id;

  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description || null;
  if (input.published !== undefined) data.published = input.published;
  if (input.slug !== undefined && input.slug !== playlist.slug) {
    if (await a.db.playlist.findFirst({ where: { slug: input.slug, id: { not: id } } })) throw new HttpError(409, "Another playlist already uses this URL", "slug_taken");
    data.slug = input.slug;
  }

  await tenantTx(tenantId, async (tx) => {
    if (Object.keys(data).length) await tx.playlist.updateMany({ where: { id, tenantId }, data });
    if (input.videoIds) {
      const ids = [...new Set(input.videoIds)];
      const owned = await tx.video.findMany({ where: { id: { in: ids }, tenantId }, select: { id: true } });
      const ok = new Set(owned.map((v) => v.id));
      await tx.playlistItem.deleteMany({ where: { playlistId: id, tenantId } });
      await tx.playlistItem.createMany({ data: ids.filter((v) => ok.has(v)).map((videoId, position) => ({ tenantId, playlistId: id, videoId, position })) });
    }
  });
  await audit({ action: "playlist.updated", tenantId, userId: a.userRow.id, target: id });
  await invalidateTenant(tenantId);
  void notifyPaths(tenantId, [`/playlist/${playlist.slug}`, ...(data.slug ? [`/playlist/${data.slug}`] : [])]);
  return { ok: true, slug: (data.slug as string | undefined) ?? playlist.slug };
});

export const DELETE = route(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { a, playlist } = await load(id);
  await a.db.playlist.deleteMany({ where: { id } });
  await audit({ action: "playlist.deleted", tenantId: a.tenant.id, userId: a.userRow.id, target: id, metadata: { slug: playlist.slug } });
  await invalidateTenant(a.tenant.id);
  void notifyPaths(a.tenant.id, [`/playlist/${playlist.slug}`]);
  return { ok: true };
});
