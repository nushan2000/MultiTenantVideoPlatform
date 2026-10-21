import { z } from "zod";
import { apiTenant } from "@/lib/access";
import { route } from "@/lib/api";
import { audit } from "@/lib/audit";
import { platformDb } from "@/lib/db/client";
import { HttpError } from "@/lib/ingest/types";
import { pageInputSchema, pageSlugCheck } from "@/lib/pages/input";
import { systemPageByKey } from "@/lib/pages/system";
import { notifyPaths } from "@/lib/seo-notify";
import { invalidateTenant } from "@/lib/tenancy/resolve";

async function load(id: string) {
  const row = await platformDb.page.findUnique({ where: { id }, select: { tenantId: true } });
  if (!row) throw new HttpError(404, "Page not found", "not_found");
  const a = await apiTenant(row.tenantId, ["OWNER", "ADMIN"]);
  const page = await a.db.page.findFirst({ where: { id } });
  if (!page) throw new HttpError(404, "Page not found", "not_found");
  return { a, page };
}

const patch = pageInputSchema.partial().extend({ slug: z.string().optional() });

export const PATCH = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const input = patch.parse(await req.json());
  const { a, page } = await load(id);
  const def = page.systemKey ? systemPageByKey(page.systemKey) : null;
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.content !== undefined) data.content = input.content;
  if (input.seo !== undefined) data.seo = input.seo as object;
  if (input.published !== undefined) data.published = def?.mandatory ? true : input.published;
  if (input.inFooter !== undefined) data.inFooter = def?.mandatory ? true : input.inFooter;
  if (input.slug !== undefined && !def && input.slug !== page.slug) {
    const slug = input.slug.trim().toLowerCase();
    const bad = pageSlugCheck(slug);
    if (bad) throw new HttpError(400, bad, "invalid");
    if (await a.db.page.findFirst({ where: { slug, id: { not: id } } })) throw new HttpError(409, "A page with this URL already exists", "slug_taken");
    data.slug = slug;
  }
  const updated = await a.db.page.update({ where: { id }, data });
  await audit({ action: "page.updated", tenantId: a.tenant.id, userId: a.userRow.id, target: id });
  await invalidateTenant(a.tenant.id);
  // the old URL changed too when a custom page was renamed
  await notifyPaths(a.tenant.id, [...new Set([page.slug, updated.slug, "/sitemap"])].map((s) => (s.startsWith("/") ? s : `/${s}`)));
  return { id: updated.id, slug: updated.slug };
});

// DELETE: a custom page is removed; a customised system page goes back to its generated default
export const DELETE = route(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { a, page } = await load(id);
  await a.db.page.deleteMany({ where: { id } });
  await audit({ action: page.systemKey ? "page.reset" : "page.deleted", tenantId: a.tenant.id, userId: a.userRow.id, target: id, metadata: { slug: page.slug } });
  await invalidateTenant(a.tenant.id);
  await notifyPaths(a.tenant.id, [`/${page.slug}`, "/sitemap"]);
  return { ok: true, reset: !!page.systemKey };
});
