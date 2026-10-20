import { apiTenant } from "./access";
import { platformDb } from "./db/client";
import { HttpError } from "./ingest/types";

/** Resolve a video id to its tenant, then authorise the signed-in user against THAT tenant (404 if not a member). */
export async function apiVideo(videoId: string) {
  const row = await platformDb.video.findUnique({ where: { id: videoId }, select: { tenantId: true } });
  if (!row) throw new HttpError(404, "Video not found", "not_found");
  const access = await apiTenant(row.tenantId);
  const video = await access.db.video.findFirst({ where: { id: videoId } });
  if (!video) throw new HttpError(404, "Video not found", "not_found");
  return { access, video };
}
