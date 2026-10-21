import { z } from "zod";
import { pageSeoInputSchema, parsePageSeo } from "@/lib/seo";
import { videoHandleTaken, videoPath, withHandleHistory } from "@/lib/handles";
import { HttpError } from "@/lib/ingest/types";
import { parseChapters, parseTags } from "@/lib/media-meta";
import { invalidateMediaCache } from "@/lib/media-cache";
import { notifyPaths } from "@/lib/seo-notify";
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
  /** ISO time: keep the video private until then, then publish it (maintenance worker). null cancels the schedule. */
  publishAt: z.string().datetime({ offset: true }).nullable().optional(),
  categoryId: z.string().nullable().optional(),
  featured: z.boolean().optional(),
  tags: z.union([z.string(), z.array(z.string())]).optional(), // "a, b" or ["a","b"] -> slugified, max 15
  chapters: z.string().max(5000).optional(), // lines like "0:00 Intro"
  transcript: z.string().max(100_000).nullable().optional(), // plain text shown on the watch page
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
  const { seo: seoInput, tags, chapters, transcript, publishAt: scheduleInput, ...rest } = data;
  const extra: Record<string, unknown> = {};
  if (scheduleInput) {
    const when = new Date(scheduleInput);
    if (!(when.getTime() > Date.now() + 60_000)) throw new HttpError(400, "Pick a publish time at least a minute from now", "invalid");
    if (when.getTime() > Date.now() + 366 * 86400_000) throw new HttpError(400, "Schedule at most a year ahead", "invalid");
    if (video.status === "BLOCKED") throw new HttpError(409, "A blocked video cannot be scheduled", "blocked");
    extra.publishAt = when;
    rest.visibility = "PRIVATE"; // stays hidden until the scheduled time
  } else if (scheduleInput === null) {
    extra.publishAt = null;
  } else if (rest.visibility && rest.visibility !== "PRIVATE" && video.publishAt) {
    extra.publishAt = null; // choosing a visibility by hand overrides a pending schedule
  }
  if (tags !== undefined) extra.tags = parseTags(tags);
  if (chapters !== undefined) extra.chapters = parseChapters(chapters, video.durationSec ?? undefined);
  if (transcript !== undefined) extra.transcript = transcript ? transcript.replace(/\u0000/g, "").trim() : null;
  let seo: object | undefined;
  if (seoInput) {
    const prev = parsePageSeo(video.seo);
    if (seoInput.handle && seoInput.handle !== prev.handle && (await videoHandleTaken(access.db, seoInput.handle, id))) {
      throw new HttpError(409, "This URL handle is already used by another video", "handle_taken");
    }
    // Changing the handle keeps the old URL working: it is remembered and 308-redirects to the new one.
    seo = { ...seoInput, previousHandles: withHandleHistory(prev, seoInput.handle, prev.handle) };
  }
  const updated = await access.db.video.update({ where: { id }, data: { ...rest, ...extra, ...(seo ? { seo } : {}) } });
  if (rest.visibility) await invalidateMediaCache(access.tenant.id, id);
  void notifyPaths(access.tenant.id, [videoPath(updated)]); // IndexNow: changed URL
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
  await invalidateMediaCache(access.tenant.id, id);
  await deletePrefix(keys.videoPrefix(access.tenant.id, id)).catch(() => {});
  await audit({ action: "video.deleted", tenantId: access.tenant.id, userId: access.userRow.id, target: id, ip: access.ip, metadata: { title: video.title } });
  return { ok: true };
});
