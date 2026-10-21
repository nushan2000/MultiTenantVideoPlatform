import { z } from "zod";
import { apiTenant } from "@/lib/access";
import { route } from "@/lib/api";
import { audit } from "@/lib/audit";
import { featuresSchema, parseFeatures } from "@/lib/theme";
import { invalidateTenant } from "@/lib/tenancy/resolve";

const patch = z.object({ noindex: z.boolean().optional(), crawlerAccess: z.boolean().optional() });

// PATCH /api/sites/:tenantId/features: the search-visibility switches (also reachable from Settings → Features)
export const PATCH = route(async (req, { params }: { params: Promise<{ tenantId: string }> }) => {
  const { tenantId } = await params;
  const a = await apiTenant(tenantId, ["OWNER", "ADMIN"]);
  const input = patch.parse(await req.json());
  const merged = featuresSchema.parse({ ...parseFeatures(a.tenant.features), ...input });
  await a.db.tenant.update({ where: { id: tenantId }, data: { features: merged as object } });
  await invalidateTenant(tenantId);
  await audit({ action: "seo.visibility_changed", tenantId, userId: a.userRow.id, ip: a.ip, metadata: input });
  return { noindex: merged.noindex, crawlerAccess: merged.crawlerAccess };
});
