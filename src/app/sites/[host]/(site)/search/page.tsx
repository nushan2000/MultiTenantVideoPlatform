import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { searchVideos } from "@/lib/storefront-data";
import { ageGateBlocks, tenantForHost } from "@/lib/storefront";
import { parseFeatures } from "@/lib/theme";
import { getTemplate } from "@/templates/registry";

export const dynamic = "force-dynamic";

// Internal search results are thin/duplicate pages: keep them out of the index but let crawlers follow links through them.
export async function generateMetadata(): Promise<Metadata> {
  return { title: "Search", robots: { index: false, follow: true } };
}

export default async function SearchPage({ params, searchParams }: { params: Promise<{ host: string }>; searchParams: Promise<{ q?: string }> }) {
  const tenant = await tenantForHost((await params).host);
  if (!tenant || !parseFeatures(tenant.features).search) notFound();
  if (await ageGateBlocks(tenant)) return null;
  const q = ((await searchParams).q ?? "").toString();
  const T = getTemplate(tenant.templateId);
  return <T.Listing heading={q ? `Results for “${q}”` : "Search"} videos={await searchVideos(tenant, q)} emptyText={q ? "No videos found." : "Type something to search."} />;
}
