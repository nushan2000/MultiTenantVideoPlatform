import { apiTenant } from "@/lib/access";
import { route } from "@/lib/api";
import { storeBranding } from "@/lib/branding";
import { HttpError } from "@/lib/ingest/types";
import { parseSiteSeo, siteSeoSchema } from "@/lib/seo";
import { invalidateTenant } from "@/lib/tenancy/resolve";

// POST /api/sites/:tenantId/branding  (multipart: kind = favicon | og | logo, file)
export const POST = route(async (req, { params }: { params: Promise<{ tenantId: string }> }) => {
  const { tenantId } = await params;
  const a = await apiTenant(tenantId, ["OWNER", "ADMIN"]);
  const form = await req.formData();
  const kind = String(form.get("kind"));
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) throw new HttpError(400, "Choose an image first", "invalid");
  if (kind !== "favicon" && kind !== "og" && kind !== "logo") throw new HttpError(400, "Unknown image type", "invalid");
  const url = await storeBranding(tenantId, file, kind);
  if (kind === "favicon") await a.db.tenant.update({ where: { id: tenantId }, data: { faviconUrl: url } });
  else if (kind === "logo") await a.db.tenant.update({ where: { id: tenantId }, data: { logoUrl: url } });
  else await a.db.tenant.update({ where: { id: tenantId }, data: { seo: siteSeoSchema.parse({ ...parseSiteSeo(a.tenant.seo), ogImage: url }) as object } });
  await invalidateTenant(tenantId);
  return { url };
});
