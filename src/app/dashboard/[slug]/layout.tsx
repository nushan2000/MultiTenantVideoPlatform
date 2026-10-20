import Link from "next/link";
import type { ReactNode } from "react";
import { requireTenant } from "@/lib/access";
import { siteUrl } from "@/lib/site-url";

const tabs = [
  ["", "Overview"], ["/videos", "Videos"], ["/settings", "Settings"], ["/seo", "SEO"], ["/domains", "Domain"],
  ["/ads", "Ads"], ["/billing", "Plan & billing"], ["/reports", "Reports"],
] as const;

export default async function TenantLayout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = await requireTenant(slug);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">{a.tenant.name}</h1>
        <a href={siteUrl(slug)} target="_blank" rel="noreferrer" className="text-sm text-blue-600 underline">{siteUrl(slug)} ↗</a>
      </div>
      <nav className="mb-6 flex flex-wrap gap-1 border-b text-sm">
        {tabs.map(([href, label]) => (
          <Link key={href} href={`/dashboard/${slug}${href}`} className="rounded-t px-3 py-2 hover:bg-white">{label}</Link>
        ))}
      </nav>
      {children}
    </>
  );
}
