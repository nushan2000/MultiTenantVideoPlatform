import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import { tenantDb } from "@/lib/db/client";
import { parsePageSeo, parseSiteSeo } from "@/lib/seo";
import { buildPageMetadata, canonicalOrigin } from "@/lib/seo-server";
import { mediaUrl } from "@/lib/storefront-data";
import { ageGateBlocks, tenantForHost } from "@/lib/storefront";
import { parseFeatures } from "@/lib/theme";
import { getTemplate } from "@/templates/registry";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ host: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await tenantForHost((await params).host);
  if (!t || (await ageGateBlocks(t))) return {};
  return buildPageMetadata({
    tenant: t, siteSeo: parseSiteSeo(t.seo), origin: await canonicalOrigin(t), path: "/categories", title: "Categories",
    description: `Browse every category of videos on ${t.name}.`,
  });
}

export default async function CategoriesPage({ params }: Props) {
  const tenant = await tenantForHost((await params).host);
  if (!tenant || !parseFeatures(tenant.features).categories) notFound();
  if (await ageGateBlocks(tenant)) return null;
  const db = tenantDb(tenant.id);
  const cats = await db.category.findMany({ orderBy: { name: "asc" }, take: 100 });
  const items = (
    await Promise.all(
      cats.map(async (c) => {
        const where = { categoryId: c.id, status: "READY" as const, visibility: "PUBLIC" as const };
        const [count, latest] = await Promise.all([db.video.count({ where }), db.video.findFirst({ where, orderBy: { createdAt: "desc" }, select: { thumbnailPath: true } })]);
        return { name: parsePageSeo(c.seo).title ? c.name : c.name, href: `/c/${c.slug}`, count, thumbUrl: mediaUrl(latest?.thumbnailPath) };
      }),
    )
  ).filter((c) => c.count > 0);
  const origin = await canonicalOrigin(tenant);
  const T = getTemplate(tenant.templateId);
  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "ItemList", itemListElement: items.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, url: `${origin}${c.href}` })) }} />
      <T.Categories categories={items} />
    </>
  );
}
