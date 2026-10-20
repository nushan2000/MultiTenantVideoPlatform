import { apiTenant } from "@/lib/access";
import { route } from "@/lib/api";
import { audit } from "@/lib/audit";
import { parseSiteSeo, siteSeoSchema } from "@/lib/seo";
import { invalidateTenant } from "@/lib/tenancy/resolve";

// PATCH /api/sites/:tenantId/seo: site-wide + home page SEO (partial update, merged with what is stored)
export const PATCH = route(async (req, { params }: { params: Promise<{ tenantId: string }> }) => {
  const { tenantId } = await params;
  const a = await apiTenant(tenantId, ["OWNER", "ADMIN"]);
  const patch = siteSeoSchema.partial().parse(await req.json());
  const merged = siteSeoSchema.parse({ ...parseSiteSeo(a.tenant.seo), ...patch });
  await a.db.tenant.update({ where: { id: tenantId }, data: { seo: merged as object } });
  await invalidateTenant(tenantId);
  await audit({ action: "seo.site_updated", tenantId, userId: a.userRow.id, ip: a.ip });
  return merged;
});
