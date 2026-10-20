import { route } from "@/lib/api";
import { apiVideo } from "@/lib/api-video";
import { dropUploadSession, getUploadSession } from "@/lib/ingest/direct";
import { releaseReservation } from "@/lib/quota";
import { abortMultipart } from "@/lib/storage";

// POST /api/videos/:id/abort: cancel an in-progress upload, free the reservation
export const POST = route(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { access, video } = await apiVideo(id);
  if (video.status !== "UPLOADING") return { ok: true };
  const session = await getUploadSession(id);
  if (session) await abortMultipart(session.key, session.uploadId);
  await dropUploadSession(id);
  await releaseReservation(access.tenant.id, id);
  await access.db.video.deleteMany({ where: { id } });
  return { ok: true };
});
