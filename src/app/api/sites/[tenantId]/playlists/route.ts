import { apiTenant } from "@/lib/access";
import { route } from "@/lib/api";
import { audit } from "@/lib/audit";
import { HttpError } from "@/lib/ingest/types";
import { MAX_PLAYLISTS, playlistInput, uniqueSlug } from "@/lib/playlists";
import { invalidateTenant } from "@/lib/tenancy/resolve";

// POST /api/sites/:tenantId/playlists: create an empty playlist
export const POST = route(async (req, { params }: { params: Promise<{ tenantId: string }> }) => {
  const { tenantId } = await params;
  const a = await apiTenant(tenantId, ["OWNER", "ADMIN", "EDITOR"]);
  const input = playlistInput.parse(await req.json());
  const existing = await a.db.playlist.findMany({ select: { slug: true } });
  if (existing.length >= MAX_PLAYLISTS) throw new HttpError(403, `You can have up to ${MAX_PLAYLISTS} playlists`, "limit");
  const slug = uniqueSlug(input.title, new Set(existing.map((p) => p.slug)));
  const created = await a.db.playlist.create({
    data: { title: input.title, slug, description: input.description || null, published: input.published ?? true, position: existing.length } as any,
  });
  await audit({ action: "playlist.created", tenantId, userId: a.userRow.id, target: created.id, metadata: { slug } });
  await invalidateTenant(tenantId);
  return { id: created.id, slug };
});
