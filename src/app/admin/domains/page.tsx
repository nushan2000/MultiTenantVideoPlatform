import { requireSuperAdmin } from "@/lib/access";
import { platformDb } from "@/lib/db/client";
import { adminRemoveDomainAction, adminVerifyDomainAction } from "../actions";
import { Card, Flash, btnDangerCls, btnGhostCls } from "@/components/ui";

import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin · Domains", robots: { index: false, follow: false } };

export default async function AdminDomains({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  await requireSuperAdmin();
  const domains = await platformDb.customDomain.findMany({ orderBy: { createdAt: "desc" }, take: 300, include: { tenant: { select: { slug: true, plan: { select: { key: true } } } } } });
  return (
    <>
      <Flash ok={sp.ok} error={sp.error} />
      <Card title={`Custom domains (${domains.length})`}>
        {domains.length === 0 && <p className="text-sm text-neutral-500">No custom domains yet.</p>}
        <ul className="divide-y text-sm">
          {domains.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 py-2">
              <strong>{d.hostname}</strong>
              <span className="text-neutral-500">{d.tenant.slug} · {d.tenant.plan.key}</span>
              <span className={`rounded px-1.5 py-0.5 text-xs ${d.status === "ACTIVE" ? "bg-green-100 text-green-800" : d.status === "FAILED" ? "bg-red-100 text-red-800" : "bg-neutral-200"}`}>{d.status.toLowerCase()}</span>
              <span className="text-xs text-neutral-400">tls: {d.tlsStatus}</span>
              <div className="ml-auto flex gap-2">
                <form action={adminVerifyDomainAction.bind(null, d.id)}><button className={btnGhostCls}>Verify</button></form>
                <form action={adminRemoveDomainAction.bind(null, d.id)}><button className={btnDangerCls}>Remove</button></form>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
