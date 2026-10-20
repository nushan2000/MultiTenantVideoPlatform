import { z } from "zod";
import { route } from "@/lib/api";
import { apiVideo } from "@/lib/api-video";
import { getUploadSession, recordPart } from "@/lib/ingest/direct";
import { HttpError } from "@/lib/ingest/types";

const body = z.object({ partNumber: z.number().int().min(1).max(10_000), etag: z.string().min(1).max(200) });

// POST /api/videos/:id/parts: the browser reports a finished part's ETag
export const POST = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { partNumber, etag } = body.parse(await req.json());
  const { video } = await apiVideo(id);
  const session = video.status === "UPLOADING" ? await getUploadSession(id) : null;
  if (!session) throw new HttpError(410, "This upload is no longer resumable", "expired");
  if (partNumber > Math.ceil(session.size / session.partSize)) throw new HttpError(400, "Part number out of range", "invalid");
  await recordPart(id, partNumber, etag);
  return { ok: true };
});
