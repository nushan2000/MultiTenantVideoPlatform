import { z } from "zod";
import { route } from "@/lib/api";
import { tenantDb } from "@/lib/db/client";
import { clientIp } from "@/lib/rate-limit";
import { redis } from "@/lib/redis";
import { requestTenant } from "@/lib/storefront";

const body = z.object({ videoId: z.string().min(1) });

// POST /api/public/view: counts at most one view per IP per video per 30 min
export const POST = route(async (req) => {
  const tenant = await requestTenant();
  const { videoId } = body.parse(await req.json());
  try {
    const first = await (await redis()).set(`view:${videoId}:${clientIp(req.headers)}`, "1", "EX", 1800, "NX");
    if (first !== "OK") return { counted: false };
  } catch {
    return { counted: false };
  }
  const r = await tenantDb(tenant.id).video.updateMany({
    where: { id: videoId, status: "READY", visibility: { in: ["PUBLIC", "UNLISTED"] } },
    data: { views: { increment: 1 } },
  });
  return { counted: r.count > 0 };
});
