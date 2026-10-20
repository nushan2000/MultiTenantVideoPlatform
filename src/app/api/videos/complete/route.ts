import { z } from "zod";
import { route } from "@/lib/api";
import { apiVideo } from "@/lib/api-video";
import { dropUploadSession, getParts, getUploadSession } from "@/lib/ingest/direct";
import { failVideo, finalizeIngest } from "@/lib/ingest/finalize";
import { HttpError } from "@/lib/ingest/types";
import { completeMultipart, headObject } from "@/lib/storage";

const body = z.object({ videoId: z.string().min(1) });

// POST /api/videos/complete: verify object exists and size matches -> enqueue transcode
export const POST = route(async (req) => {
  const { videoId } = body.parse(await req.json());
  const { access, video } = await apiVideo(videoId);
  if (video.status !== "UPLOADING" || video.ingestMethod !== "DIRECT") throw new HttpError(409, "This upload is not in progress", "bad_state");
  const session = await getUploadSession(videoId);
  if (!session) throw new HttpError(410, "This upload expired. Please start again.", "expired");

  // Prefer the store's own list of parts (ListParts); sizes are derived from the upload plan, not the client.
  const parts = await getParts(videoId, session);
  const total = Math.ceil(session.size / session.partSize);
  const have = new Set(parts.map((p) => p.PartNumber));
  const missing = Array.from({ length: total }, (_, i) => i + 1).filter((n) => !have.has(n));
  if (missing.length) throw new HttpError(409, `Missing parts: ${missing.slice(0, 10).join(", ")}`, "incomplete");
  if (parts.reduce((s, p) => s + p.Size, 0) !== session.size) throw new HttpError(409, "Uploaded size does not match", "size_mismatch");

  await completeMultipart(session.key, session.uploadId, parts.map((p) => ({ PartNumber: p.PartNumber, ETag: p.ETag })));
  const obj = await headObject(session.key);
  if (!obj || obj.size !== session.size) {
    await failVideo(access.tenant.id, videoId, "The uploaded file did not match its declared size");
    throw new HttpError(409, "Uploaded file size mismatch", "size_mismatch");
  }
  await dropUploadSession(videoId);
  await finalizeIngest(access.tenant.id, videoId);
  return { ok: true, status: "PROCESSING" };
});
