import { z } from "zod";
import { bumpWatch } from "@/lib/analytics";
import { route } from "@/lib/api";
import { tenantTx } from "@/lib/db/client";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { requestTenant } from "@/lib/storefront";

// Player heartbeat: "this visitor has watched N more seconds". Capped per request and per visitor so the numbers can't be inflated cheaply.
const body = z.object({ videoId: z.string().min(1), seconds: z.number().int().min(1).max(120) });

export const POST = route(async (req) => {
  const tenant = await requestTenant();
  const ip = clientIp(req.headers);
  await rateLimit(`watch:ip:${ip}`, 40, 600);
  const { videoId, seconds } = body.parse(await req.json());
  return tenantTx(tenant.id, async (tx) => {
    const v = await tx.video.findFirst({ where: { id: videoId, tenantId: tenant.id, status: "READY", visibility: { in: ["PUBLIC", "UNLISTED"] } }, select: { id: true } });
    if (!v) return { counted: false };
    await bumpWatch(tx, tenant.id, videoId, seconds);
    return { counted: true };
  });
});
