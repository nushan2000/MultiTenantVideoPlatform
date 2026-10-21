import { z } from "zod";
import { route } from "@/lib/api";
import { tenantTx } from "@/lib/db/client";
import { voterHash } from "@/lib/engagement";
import { HttpError } from "@/lib/ingest/types";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { requestTenant } from "@/lib/storefront";
import { parseFeatures } from "@/lib/theme";

const body = z.object({ videoId: z.string().min(1) });

// POST /api/public/like: toggles this visitor's like. Raw SQL for the counter so Video.updatedAt (sitemap lastmod) is untouched.
export const POST = route(async (req) => {
  const tenant = await requestTenant();
  if (!parseFeatures(tenant.features).likes) throw new HttpError(403, "Likes are turned off on this site", "disabled");
  const ip = clientIp(req.headers);
  await rateLimit(`like:ip:${ip}`, 40, 600);
  const { videoId } = body.parse(await req.json());
  const voter = voterHash(videoId, ip, req.headers.get("user-agent") ?? "");

  return tenantTx(tenant.id, async (tx) => {
    const video = await tx.video.findFirst({ where: { id: videoId, tenantId: tenant.id, status: "READY", visibility: { in: ["PUBLIC", "UNLISTED"] } }, select: { id: true } });
    if (!video) throw new HttpError(404, "Video not found", "not_found");
    const removed = await tx.videoLike.deleteMany({ where: { videoId, voterHash: voter, tenantId: tenant.id } });
    if (removed.count > 0) {
      await tx.$executeRaw`UPDATE "Video" SET likes = GREATEST(likes - 1, 0) WHERE id = ${videoId} AND "tenantId" = ${tenant.id}`;
      const [{ likes }] = await tx.$queryRaw<{ likes: number }[]>`SELECT likes FROM "Video" WHERE id = ${videoId}`;
      return { liked: false, likes };
    }
    await tx.videoLike.create({ data: { tenantId: tenant.id, videoId, voterHash: voter } });
    await tx.$executeRaw`UPDATE "Video" SET likes = likes + 1 WHERE id = ${videoId} AND "tenantId" = ${tenant.id}`;
    const [{ likes }] = await tx.$queryRaw<{ likes: number }[]>`SELECT likes FROM "Video" WHERE id = ${videoId}`;
    return { liked: true, likes };
  });
});
