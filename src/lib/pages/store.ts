import { tenantDb } from "../db/client";
import { parsePageSeo, type PageSeo } from "../seo";
import { parseProfile } from "./profile";
import { systemPagesFor } from "./system";

export type StorePage = {
  id: string | null; // Page row id (null = untouched system default)
  key: string | null; // system key, null for custom pages
  slug: string;
  title: string;
  markdown: string;
  description: string; // meta description (custom or default)
  group: "help" | "legal" | "more";
  mandatory: boolean;
  custom: boolean;
  customized: boolean; // system page with an owner override
  published: boolean;
  inFooter: boolean;
  seo: PageSeo;
  updatedAt: Date | null;
};

type TenantLike = { id: string; name: string; contentCategory: string; profile: unknown };

/** System pages (generated or overridden) + custom pages, in display order. Includes unpublished (callers filter). */
export async function loadPages(t: TenantLike, origin: string): Promise<StorePage[]> {
  const rows = await tenantDb(t.id).page.findMany({ orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  const adult = t.contentCategory === "ADULT";
  const ctx = { siteName: t.name, siteUrl: origin, profile: parseProfile(t.profile), adult };
  const out: StorePage[] = [];
  for (const def of systemPagesFor(adult)) {
    const row = rows.find((r) => r.systemKey === def.key);
    const seo = parsePageSeo(row?.seo);
    out.push({
      id: row?.id ?? null, key: def.key, slug: def.slug, title: row?.title ?? def.title, markdown: row ? row.content : def.body(ctx),
      description: seo.description || def.description(ctx), group: def.group, mandatory: def.mandatory, custom: false, customized: !!row,
      // legal basics can never be hidden
      published: def.mandatory ? true : row?.published ?? true, inFooter: def.mandatory ? true : row?.inFooter ?? true, seo, updatedAt: row?.updatedAt ?? null,
    });
  }
  for (const r of rows.filter((x) => !x.systemKey)) {
    const seo = parsePageSeo(r.seo);
    out.push({
      id: r.id, key: null, slug: r.slug, title: r.title, markdown: r.content, description: seo.description ?? "", group: "more", mandatory: false,
      custom: true, customized: false, published: r.published, inFooter: r.inFooter, seo, updatedAt: r.updatedAt,
    });
  }
  return out;
}

export { footerGroups, navLinksFor, type FooterGroup } from "./footer";
