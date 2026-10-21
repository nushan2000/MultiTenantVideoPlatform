import { route } from "@/lib/api";
import { tenantDb } from "@/lib/db/client";
import { commentInput, commentProblem, ipHash } from "@/lib/engagement";
import { HttpError } from "@/lib/ingest/types";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { requestTenant } from "@/lib/storefront";
import { parseFeatures } from "@/lib/theme";

// POST /api/public/comment: anonymous comment on a public video. Held for moderation unless the owner turned on auto-approve.
export const POST = route(async (req) => {
  const tenant = await requestTenant();
  const features = parseFeatures(tenant.features);
  if (!features.comments) throw new HttpError(403, "Comments are turned off on this site", "disabled");
  const ip = clientIp(req.headers);
  await rateLimit(`comment:ip:${ip}`, 5, 600);
  await rateLimit(`comment:tenant:${tenant.id}`, 300, 600);
  const input = commentInput.parse(await req.json());

  // Bots fill the hidden field: pretend it worked.
  if (input.website) return { ok: true, status: "PENDING" };
  const problem = commentProblem(input);
  if (problem) throw new HttpError(400, problem, "spam");

  const db = tenantDb(tenant.id);
  const video = await db.video.findFirst({ where: { id: input.videoId, status: "READY", visibility: { in: ["PUBLIC", "UNLISTED"] } }, select: { id: true } });
  if (!video) throw new HttpError(404, "Video not found", "not_found");

  const status = features.commentsAutoApprove ? "APPROVED" : "PENDING";
  const c = await db.comment.create({ data: { videoId: video.id, authorName: input.name, body: input.body, status, ipHash: ipHash(tenant.id, ip) } as any });
  return { ok: true, status, comment: status === "APPROVED" ? { id: c.id, authorName: c.authorName, body: c.body, createdAt: c.createdAt } : undefined };
});
