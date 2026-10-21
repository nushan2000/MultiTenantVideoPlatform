import { route } from "@/lib/api";
import { apiVideo } from "@/lib/api-video";
import { audit } from "@/lib/audit";
import { HttpError } from "@/lib/ingest/types";
import { notifyVideo } from "@/lib/seo-notify";
import { keys, putObject } from "@/lib/storage";
import { imageToThumbs } from "@/lib/transcode";

const TYPES: Record<string, { ext: string; magic: number[] }> = {
  "image/png": { ext: "png", magic: [0x89, 0x50, 0x4e, 0x47] },
  "image/jpeg": { ext: "jpg", magic: [0xff, 0xd8, 0xff] },
  "image/webp": { ext: "webp", magic: [0x52, 0x49, 0x46, 0x46] },
};

// POST /api/videos/:id/thumbnail  (multipart: file). Replaces the automatic frame with the owner's own poster image.
// Validated by magic bytes (SVG refused), re-encoded to JPEG by ffmpeg, so what is stored is never the raw upload.
export const POST = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { access, video } = await apiVideo(id);
  if (video.status !== "READY") throw new HttpError(409, "You can change the thumbnail once the video has finished processing", "not_ready");
  const file = (await req.formData()).get("file");
  if (!(file instanceof File) || file.size === 0) throw new HttpError(400, "Choose an image first", "invalid");
  if (file.size > 5 * 1024 * 1024) throw new HttpError(400, "Thumbnails can be at most 5 MB", "too_large");
  const type = TYPES[file.type];
  const buf = Buffer.from(await file.arrayBuffer());
  if (!type || !type.magic.every((b, i) => buf[i] === b)) throw new HttpError(400, "Use a PNG, JPEG or WebP image", "invalid");

  const { small, large } = await imageToThumbs(buf, type.ext);
  const tenantId = access.tenant.id;
  await putObject(keys.thumb(tenantId, id), small, "image/jpeg");
  await putObject(keys.thumbLarge(tenantId, id), large, "image/jpeg");
  // the paths are unchanged, so make sure the row points at them (older rows may predate thumbnails)
  await access.db.video.update({ where: { id }, data: { thumbnailPath: keys.thumb(tenantId, id) } });
  await audit({ action: "video.thumbnail_changed", tenantId, userId: access.userRow.id, target: id, ip: access.ip });
  void notifyVideo(tenantId, id);
  return { ok: true, thumb: keys.thumb(tenantId, id) };
});
