import { z } from "zod";
import { apiTenant } from "@/lib/access";
import { route } from "@/lib/api";
import { directInitSchema, directUpload } from "@/lib/ingest/direct";
import { rateLimit } from "@/lib/rate-limit";

const body = directInitSchema.extend({ tenantId: z.string().min(1) });

// POST /api/videos/init: checks quota, per-upload size, video count -> creates Video(UPLOADING) -> multipart upload
export const POST = route(async (req) => {
  const input = body.parse(await req.json());
  const a = await apiTenant(input.tenantId, ["OWNER", "ADMIN", "EDITOR"]);
  await rateLimit(`upload-init:tenant:${a.tenant.id}`, 60, 60);
  await rateLimit(`upload-init:user:${a.userRow.id}`, 30, 60);
  return directUpload.start({ tenantId: a.tenant.id, userId: a.userRow.id, planKey: a.planKey, ip: a.ip }, input);
});
