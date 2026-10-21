import { requireTenant } from "@/lib/access";
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
  return (
    <Customizer
      slug={slug}
      templateId={a.tenant.templateId}
      templates={listTemplates()}
      name={a.tenant.name}
      logoUrl={a.tenant.logoUrl}
      categoryNames={categories.map((c) => c.name)}
      theme={theme}
      features={{ search: features.search, categories: features.categories }}
      canUseCustomTheme={a.ent.canUseCustomTheme}
      canUseCustomCss={a.ent.canUseCustomCss}
      planKey={a.planKey}
      siteUrl={siteUrl(slug)}
      canEdit={a.role === "OWNER" || a.role === "ADMIN"}
    />
  );
}
