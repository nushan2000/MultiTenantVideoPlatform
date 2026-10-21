import { z } from "zod";
import { apiTenant } from "@/lib/access";
import { route } from "@/lib/api";
import { audit } from "@/lib/audit";
import { HttpError } from "@/lib/ingest/types";
import { parsePageSeo, stripText } from "@/lib/seo";
import { invalidateTenant } from "@/lib/tenancy/resolve";

const text = (max: number) => z.string().max(max * 2).transform(stripText).pipe(z.string().max(max));
const body = z.object({
  rows: z
    .array(z.object({ type: z.enum(["video", "category", "page"]), id: z.string().min(1), title: text(70).optional(), description: text(300).optional() }))
    .min(1)
    .max(500),
});

// POST /api/sites/:tenantId/seo/bulk: update SEO title/description for many videos/categories/pages at once (CSV import).
// Only these two fields change; handles, tags, noindex and everything else stay as they are.
export const POST = route(async (req, { params }: { params: Promise<{ tenantId: string }> }) => {
  const { tenantId } = await params;
  const a = await apiTenant(tenantId, ["OWNER", "ADMIN", "EDITOR"]);
  const { rows } = body.parse(await req.json());
  if (rows.length > 500) throw new HttpError(400, "At most 500 rows per import", "invalid");
  let updated = 0;
  const skipped: string[] = [];
  for (const r of rows) {
    const model = r.type === "video" ? a.db.video : r.type === "page" ? a.db.page : a.db.category;
    const current = (await (model as any).findFirst({ where: { id: r.id }, select: { seo: true } })) as { seo: unknown } | null;
    if (!current) { skipped.push(r.id); continue; }
    const prev = parsePageSeo(current.seo);
    const seo = { ...prev, ...(r.title !== undefined ? { title: r.title || undefined } : {}), ...(r.description !== undefined ? { description: r.description || undefined } : {}) };
    await (model as any).update({ where: { id: r.id }, data: { seo } });
    updated++;
  }
  if (rows.some((r) => r.type === "page")) await invalidateTenant(tenantId);
  await audit({ action: "seo.bulk_updated", tenantId, userId: a.userRow.id, ip: a.ip, metadata: { updated, skipped: skipped.length } });
  return { updated, skipped };
});
