import { z } from "zod";
import { apiTenant } from "@/lib/access";
import { route } from "@/lib/api";
import { platformDb } from "@/lib/db/client";
import { withHandleHistory } from "@/lib/handles";
import { HttpError } from "@/lib/ingest/types";
import { handleSchema, pageSeoInputSchema, parsePageSeo } from "@/lib/seo";
import { invalidateTenant } from "@/lib/tenancy/resolve";

const body = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  /** URL handle = the category slug (/c/<handle>). The old one keeps redirecting. */
  handle: handleSchema.optional(),
  seo: pageSeoInputSchema.omit({ handle: true }).optional(),
});

// PATCH /api/categories/:id: rename, change URL handle, edit SEO. Client-side editor saves here.
export const PATCH = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const input = body.parse(await req.json());
  const row = await platformDb.category.findUnique({ where: { id }, select: { tenantId: true } });
  if (!row) throw new HttpError(404, "Category not found", "not_found");
  const a = await apiTenant(row.tenantId, ["OWNER", "ADMIN", "EDITOR"]);
  const cat = await a.db.category.findFirst({ where: { id } });
  if (!cat) throw new HttpError(404, "Category not found", "not_found");

  const prev = parsePageSeo(cat.seo);
  const data: Record<string, unknown> = {};
  if (input.name) data.name = input.name;
  let history = prev.previousHandles;
  if (input.handle && input.handle !== cat.slug) {
    if (await a.db.category.findFirst({ where: { slug: input.handle, id: { not: id } } })) throw new HttpError(409, "This URL handle is already used by another category", "handle_taken");
    data.slug = input.handle;
    history = withHandleHistory(prev, input.handle, cat.slug);
  }
  if (input.seo || data.slug) data.seo = { ...(input.seo ?? { ...prev, handle: undefined }), previousHandles: history };
  const updated = await a.db.category.update({ where: { id }, data });
  await invalidateTenant(a.tenant.id);
  return { id: updated.id, name: updated.name, slug: updated.slug, seo: updated.seo };
});
