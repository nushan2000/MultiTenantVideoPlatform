import { route } from "@/lib/api";
import { apiVideo } from "@/lib/api-video";
import { getParts, getUploadSession } from "@/lib/ingest/direct";
import { HttpError } from "@/lib/ingest/types";

// GET /api/videos/:id/upload: resume state (which parts the store already has)
export const GET = route(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { video } = await apiVideo(id);
  const session = video.status === "UPLOADING" ? await getUploadSession(id) : null;
  if (!session) throw new HttpError(410, "This upload is no longer resumable", "expired");
  const parts = await getParts(id, session);
  return { partSize: session.partSize, totalParts: Math.ceil(session.size / session.partSize), parts };
});
