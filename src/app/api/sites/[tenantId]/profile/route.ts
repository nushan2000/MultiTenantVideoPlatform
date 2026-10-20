import { apiTenant } from "@/lib/access";
import { route } from "@/lib/api";
import { audit } from "@/lib/audit";
import { parseProfile, profileSchema } from "@/lib/pages/profile";
import { invalidateTenant } from "@/lib/tenancy/resolve";

// PATCH /api/sites/:tenantId/profile: business details used by the legal pages
export const PATCH = route(async (req, { params }: { params: Promise<{ tenantId: string }> }) => {
  const { tenantId } = await params;
  const a = await apiTenant(tenantId, ["OWNER", "ADMIN"]);
  const patch = profileSchema.partial().parse(await req.json());
  const merged = profileSchema.parse({ ...parseProfile(a.tenant.profile), ...patch });
  await a.db.tenant.update({ where: { id: tenantId }, data: { profile: merged as object } });
  await invalidateTenant(tenantId);
  await audit({ action: "profile.updated", tenantId, userId: a.userRow.id, ip: a.ip });
  return merged;
});
