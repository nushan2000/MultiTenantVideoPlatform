import { route } from "@/lib/api";
import { apiVideo } from "@/lib/api-video";
import { HttpError } from "@/lib/ingest/types";
import { LANG_RE, looksLikeCaptions, parseCaptionsJson, toVtt, vttToText, type Caption } from "@/lib/media-meta";
import { stripText } from "@/lib/seo";
import { s3, keys, putObject } from "@/lib/storage";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getEnv } from "@/lib/env";

// POST /api/videos/:id/captions  (multipart: lang, label, file .vtt|.srt)
// Captions make videos accessible and give search engines the spoken text (the biggest video-SEO signal after the title).
export const POST = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { access, video } = await apiVideo(id);
  const form = await req.formData();
  const lang = String(form.get("lang") ?? "").trim();
  const label = stripText(String(form.get("label") ?? "")).slice(0, 40) || lang;
  const file = form.get("file");
  if (!LANG_RE.test(lang)) throw new HttpError(400, "Use a language code like en, es or pt-BR", "invalid");
  if (!(file instanceof File) || file.size === 0) throw new HttpError(400, "Choose a .vtt or .srt file", "invalid");
  if (file.size > 2 * 1024 * 1024) throw new HttpError(400, "Caption files can be at most 2 MB", "too_large");
  const raw = await file.text();
  if (!looksLikeCaptions(raw)) throw new HttpError(400, "This does not look like a WebVTT or SRT caption file", "invalid");
  const vtt = toVtt(raw);

  const existing = parseCaptionsJson(video.captions).filter((c) => c.lang !== lang);
  if (existing.length >= 19) throw new HttpError(403, "You can add up to 20 caption languages", "limit");
  const path = keys.caption(access.tenant.id, id, lang);
  await putObject(path, vtt, "text/vtt; charset=utf-8", "public, max-age=300");
  const captions: Caption[] = [...existing, { lang, label, path }];
  // first caption becomes the on-page transcript (searchable text) unless the owner already wrote one
  const transcript = video.transcript?.trim() ? undefined : vttToText(vtt);
  await access.db.video.update({ where: { id }, data: { captions: captions as unknown as object[], ...(transcript ? { transcript } : {}) } });
  return { captions, transcriptFilled: !!transcript };
});

// DELETE /api/videos/:id/captions?lang=es
export const DELETE = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { access, video } = await apiVideo(id);
  const lang = new URL(req.url).searchParams.get("lang") ?? "";
  const current = parseCaptionsJson(video.captions);
  const hit = current.find((c) => c.lang === lang);
  if (!hit) throw new HttpError(404, "Caption not found", "not_found");
  await s3().send(new DeleteObjectCommand({ Bucket: getEnv().S3_BUCKET, Key: hit.path })).catch(() => {});
  const captions = current.filter((c) => c.lang !== lang);
  await access.db.video.update({ where: { id }, data: { captions: captions as unknown as object[] } });
  return { captions };
});
