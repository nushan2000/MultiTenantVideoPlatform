import { z } from "zod";
import { pageSeoInputSchema, parsePageSeo } from "@/lib/seo";
import { videoHandleTaken, videoPath, withHandleHistory } from "@/lib/handles";
import { HttpError } from "@/lib/ingest/types";
import { route, serializeVideo } from "@/lib/api";
import { apiVideo } from "@/lib/api-video";
import { audit } from "@/lib/audit";
import { dropUploadSession, getUploadSession } from "@/lib/ingest/direct";
import { freeVideoBytes } from "@/lib/quota";
import { abortMultipart, deletePrefix, keys } from "@/lib/storage";

const patch = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  visibility: z.enum(["PUBLIC", "UNLISTED", "PRIVATE"]).optional(),
  categoryId: z.string().nullable().optional(),
  featured: z.boolean().optional(),
  seo: pageSeoInputSchema.optional(), // per-video SEO overrides (validated, sanitised, https-only URLs)
});

export const PATCH = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const data = patch.parse(await req.json());
  const { access, video } = await apiVideo(id);
  if (video.status === "BLOCKED") data.visibility = undefined; // takedown can't be undone by the tenant
  if (data.categoryId) {
    const cat = await access.db.category.findFirst({ where: { id: data.categoryId } });
    if (!cat) data.categoryId = null;
  }
  const { seo: seoInput, ...rest } = data;
  let seo: object | undefined;
  if (seoInput) {
    const prev = parsePageSeo(video.seo);
    if (seoInput.handle && seoInput.handle !== prev.handle && (await videoHandleTaken(access.db, seoInput.handle, id))) {
      throw new HttpError(409, "This URL handle is already used by another video", "handle_taken");
    }
    // Changing the handle keeps the old URL working: it is remembered and 308-redirects to the new one.
    seo = { ...seoInput, previousHandles: withHandleHistory(prev, seoInput.handle, prev.handle) };
  }
  const updated = await access.db.video.update({ where: { id }, data: { ...rest, ...(seo ? { seo } : {}) } });
  return { ...serializeVideo(updated), path: videoPath(updated) };
});

export const DELETE = route(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { access, video } = await apiVideo(id);
  const session = video.status === "UPLOADING" ? await getUploadSession(id) : null;
  if (session) await abortMultipart(session.key, session.uploadId);
  await dropUploadSession(id);
  await freeVideoBytes(access.tenant.id, id);
  await access.db.video.deleteMany({ where: { id } });
  await deletePrefix(keys.videoPrefix(access.tenant.id, id)).catch(() => {});
  await audit({ action: "video.deleted", tenantId: access.tenant.id, userId: access.userRow.id, target: id, ip: access.ip, metadata: { title: video.title } });
  return { ok: true };
});
