import { z } from "zod";
import { apiTenant } from "@/lib/access";
import { route } from "@/lib/api";
import { importSchema, urlImport } from "@/lib/ingest/url";
import { rateLimit } from "@/lib/rate-limit";

const body = importSchema.and(z.object({ tenantId: z.string().min(1) }));

// POST /api/videos/import: single `url` or batch `urls`, rights confirmation required
export const POST = route(async (req) => {
  const input = body.parse(await req.json());
  const a = await apiTenant(input.tenantId, ["OWNER", "ADMIN", "EDITOR"]);
  await rateLimit(`import:tenant:${a.tenant.id}`, 20, 60);
  await rateLimit(`import:user:${a.userRow.id}`, 10, 60);
  return urlImport.start({ tenantId: a.tenant.id, userId: a.userRow.id, planKey: a.planKey, ip: a.ip }, input);
});
