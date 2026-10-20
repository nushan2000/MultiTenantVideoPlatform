import { z } from "zod";
import { route } from "@/lib/api";
import { apiVideo } from "@/lib/api-video";
import { getUploadSession } from "@/lib/ingest/direct";
import { HttpError } from "@/lib/ingest/types";
import { presignPart } from "@/lib/storage";

const body = z.object({ partNumbers: z.array(z.number().int().min(1).max(10_000)).min(1).max(20) });

// POST /api/videos/:id/part-urls: presigned PUT URLs; the browser uploads parts straight to object storage
export const POST = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { partNumbers } = body.parse(await req.json());
  const { video } = await apiVideo(id);
  const session = video.status === "UPLOADING" ? await getUploadSession(id) : null;
  if (!session) throw new HttpError(410, "This upload is no longer resumable", "expired");
  const total = Math.ceil(session.size / session.partSize);
  if (partNumbers.some((n) => n > total)) throw new HttpError(400, "Part number out of range", "invalid");
  const urls = await Promise.all(partNumbers.map(async (n) => ({ partNumber: n, url: await presignPart(session.key, session.uploadId, n) })));
  return { urls };
});
