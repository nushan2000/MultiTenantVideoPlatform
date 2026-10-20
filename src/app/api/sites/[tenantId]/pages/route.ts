import { z } from "zod";
import { apiTenant } from "@/lib/access";
import { route } from "@/lib/api";
import { audit } from "@/lib/audit";
import { HttpError } from "@/lib/ingest/types";
import { pageInputSchema, pageSlugCheck } from "@/lib/pages/input";
import { systemPageByKey } from "@/lib/pages/system";
import { slugifyHandle } from "@/lib/seo";

const body = pageInputSchema.extend({ slug: z.string().optional(), systemKey: z.string().optional() });

// POST /api/sites/:tenantId/pages: create a custom page, or customise a system page (systemKey)
export const POST = route(async (req, { params }: { params: Promise<{ tenantId: string }> }) => {
  const { tenantId } = await params;
  const a = await apiTenant(tenantId, ["OWNER", "ADMIN"]);
  const input = body.parse(await req.json());

  if (input.systemKey) {
    const def = systemPageByKey(input.systemKey);
    if (!def) throw new HttpError(404, "Unknown system page", "not_found");
    if (def.adultOnly && a.tenant.contentCategory !== "ADULT") throw new HttpError(400, "This page only applies to adult sites", "invalid");
    if (await a.db.page.findFirst({ where: { systemKey: def.key } })) throw new HttpError(409, "This page is already customised", "exists");
    const page = await a.db.page.create({
      data: { slug: def.slug, systemKey: def.key, title: input.title, content: input.content, published: def.mandatory ? true : input.published, inFooter: def.mandatory ? true : input.inFooter, seo: input.seo as object } as any,
    });
    await audit({ action: "page.customised", tenantId, userId: a.userRow.id, target: page.id, metadata: { key: def.key } });
    return { id: page.id, slug: page.slug };
  }

  const slug = input.slug?.trim() ? input.slug.trim().toLowerCase() : slugifyHandle(input.title);
  const check = pageSlugCheck(slug);
  if (check) throw new HttpError(400, check, "invalid");
  if (await a.db.page.findFirst({ where: { slug } })) throw new HttpError(409, "A page with this URL already exists", "slug_taken");
  const count = await a.db.page.count();
  if (count >= 50) throw new HttpError(403, "You can have up to 50 pages", "page_limit");
  const page = await a.db.page.create({
    data: { slug, title: input.title, content: input.content, published: input.published, inFooter: input.inFooter, position: count, seo: input.seo as object } as any,
  });
  await audit({ action: "page.created", tenantId, userId: a.userRow.id, target: page.id, metadata: { slug } });
  return { id: page.id, slug: page.slug };
});
