import { requireTenant } from "@/lib/access";
import { renderMarkdown } from "@/lib/pages/markdown";
import { loadPages } from "@/lib/pages/store";
import { tenantPublicOrigin } from "@/lib/seo-server";
import { siteUrl } from "@/lib/site-url";
import { parseFeatures, parseTheme } from "@/lib/theme";
import { listTemplates } from "@/templates/registry";
import { Customizer } from "./Customizer";

export default async function Customize({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = await requireTenant(slug);
  const theme = parseTheme(a.tenant.theme);
  const features = parseFeatures(a.tenant.features);
  const categories = await a.db.category.findMany({ orderBy: { name: "asc" }, take: 8, select: { name: true } });
  const { origin } = await tenantPublicOrigin({ id: a.tenant.id, slug, planKey: a.planKey });
  // the real pages drive the preview's header and footer, so what you design is what visitors get
  const pages = await loadPages(a.tenant, origin);
  const sample = pages.find((p) => p.key === "about") ?? pages[0];
  return (
    <Customizer
      slug={slug}
      tenantId={a.tenant.id}
      faviconUrl={a.tenant.faviconUrl}
      pages={pages.map((p) => ({ key: p.key, slug: p.slug, title: p.title, customized: p.customized, group: p.group, published: p.published, inFooter: p.inFooter }))}
      samplePage={sample ? { title: sample.title, html: renderMarkdown(sample.markdown) } : null}
      templateId={a.tenant.templateId}
      templates={listTemplates()}
      name={a.tenant.name}
      logoUrl={a.tenant.logoUrl}
      categoryNames={categories.map((c) => c.name)}
      theme={theme}
      features={{ search: features.search, categories: features.categories, comments: features.comments, likes: features.likes }}
      canUseCustomTheme={a.ent.canUseCustomTheme}
      canUseCustomCss={a.ent.canUseCustomCss}
      planKey={a.planKey}
      siteUrl={siteUrl(slug)}
      canEdit={a.role === "OWNER" || a.role === "ADMIN"}
    />
  );
}
