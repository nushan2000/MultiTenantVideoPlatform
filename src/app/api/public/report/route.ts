import { z } from "zod";
import { route } from "@/lib/api";
import { audit } from "@/lib/audit";
import { tenantDb } from "@/lib/db/client";
import { HttpError } from "@/lib/ingest/types";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { requestTenant } from "@/lib/storefront";

const body = z
  .object({
    videoId: z.string().min(1),
    type: z.enum(["ABUSE", "DMCA"]),
    reason: z.string().trim().min(10, "Please describe the problem (at least 10 characters)").max(4000),
    email: z.string().email().max(200).optional().or(z.literal("")),
  })
  .refine((v) => v.type !== "DMCA" || !!v.email, { message: "An email address is required for DMCA notices", path: ["email"] });

// POST /api/public/report: abuse / DMCA form on every watch page
export const POST = route(async (req) => {
  const tenant = await requestTenant();
  const ip = clientIp(req.headers);
  await rateLimit(`report:ip:${ip}`, 5, 600);
  await rateLimit(`report:tenant:${tenant.id}`, 100, 600);
  const input = body.parse(await req.json());

  const db = tenantDb(tenant.id);
  const video = await db.video.findFirst({ where: { id: input.videoId }, select: { id: true } });
  if (!video) throw new HttpError(404, "Video not found", "not_found");
  const report = await db.report.create({
    data: { videoId: video.id, type: input.type, reason: input.reason, reporterEmail: input.email || null, reporterIp: ip } as any,
  });
  await audit({ action: "report.created", tenantId: tenant.id, target: report.id, ip, metadata: { type: input.type, videoId: video.id } });
  return { ok: true };
});
