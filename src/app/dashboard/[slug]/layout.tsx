import type { ReactNode } from "react";
import { requireTenant } from "@/lib/access";
import { siteUrl } from "@/lib/site-url";
import { TenantNav } from "./TenantNav";

export default async function TenantLayout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = await requireTenant(slug);
  return (
    <>
      <TenantNav
        slug={slug}
        name={a.tenant.name}
        siteUrl={siteUrl(slug)}
        planKey={a.planKey}
        logoUrl={a.tenant.logoUrl}
        role={a.role}
      />
      {children}
    </>
  );
}
