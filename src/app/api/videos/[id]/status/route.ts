import { route } from "@/lib/api";
import { apiVideo } from "@/lib/api-video";
import { progressKey } from "@/lib/import/run";
import { redis } from "@/lib/redis";

// GET /api/videos/:id/status: poll for live import progress, status and failure reason
export const GET = route(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { video } = await apiVideo(id);
  let downloaded: number | null = null;
  let total: number | null = null;
  if (video.status === "IMPORTING") {
    try {
      const raw = await (await redis()).get(progressKey(id));
      if (raw) ({ downloaded, total } = JSON.parse(raw));
    } catch {}
  }
  const percent = video.status === "READY" ? 100 : total ? Math.min(99, Math.floor(((downloaded ?? 0) / total) * 100)) : video.importProgress;
  return {
    id: video.id,
    status: video.status,
    ingestMethod: video.ingestMethod,
    percent,
    downloadedBytes: downloaded,
    totalBytes: total,
    failureReason: video.failureReason,
  };
}, { csrf: false });
