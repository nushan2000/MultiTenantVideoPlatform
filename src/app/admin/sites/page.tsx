import Link from "next/link";
import { requireSuperAdmin } from "@/lib/access";
import { platformDb } from "@/lib/db/client";
import { deleteTenantAction, setTenantCategoryAction, setTenantPlanAction, setTenantStatusAction } from "../actions";
import { Card, Flash, btnDangerCls, btnGhostCls, formatBytes, inputCls } from "@/components/ui";

import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin · Sites", robots: { index: false, follow: false } };

export default async function AdminSites({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; q?: string }> }) {
  const sp = await searchParams;
  await requireSuperAdmin();
  const q = sp.q?.trim();
  const tenants = await platformDb.tenant.findMany({
    where: q ? { OR: [{ slug: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {},
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      plan: true,
      storageUsage: true,
      _count: { select: { videos: true, domains: true } },
      memberships: { where: { role: "OWNER" }, include: { user: { select: { email: true } } } },
    },
  });
  return (
    <>
      <Flash ok={sp.ok} error={sp.error} />
      <Card title={`Sites (${tenants.length}${tenants.length === 200 ? "+" : ""})`}>
        <form className="mb-4 flex gap-2"><input className={inputCls} name="q" defaultValue={q} placeholder="Search by slug or name" /><button className={btnGhostCls}>Search</button></form>
        <ul className="divide-y text-sm">
          {tenants.map((t) => (
            <li key={t.id} className="py-3">
              <div className="flex flex-wrap items-center gap-2">
                <strong>{t.name}</strong>
                <span className="text-neutral-500">{t.slug}</span>
                <span className={`rounded px-1.5 py-0.5 text-xs ${t.status === "ACTIVE" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>{t.status.toLowerCase()}</span>
                <Link className="ml-auto text-blue-600 underline" href={`/dashboard/${t.slug}`}>Manage site →</Link>
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                Owner: {t.memberships.map((m) => m.user.email).join(", ") || "none"} · {t._count.videos} videos · {t._count.domains} domains · {formatBytes(Number(t.storageUsage?.bytesUsed ?? 0))} used
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <form action={setTenantPlanAction.bind(null, t.id)} className="flex gap-2">
                  <select className={`${inputCls} w-32`} name="plan" defaultValue={t.plan.key}><option value="free">Free</option><option value="premium">Premium</option></select>
                  <button className={btnGhostCls}>Set plan</button>
                </form>
                <form action={setTenantCategoryAction.bind(null, t.id)} className="flex gap-2">
                  <select className={`${inputCls} w-32`} name="category" defaultValue={t.contentCategory}><option value="GENERAL">General</option><option value="ADULT">Adult</option></select>
                  <button className={btnGhostCls}>Set type</button>
                </form>
                {t.status === "ACTIVE"
                  ? <form action={setTenantStatusAction.bind(null, t.id, "SUSPENDED")}><button className={btnDangerCls}>Suspend</button></form>
                  : <form action={setTenantStatusAction.bind(null, t.id, "ACTIVE")}><button className={btnGhostCls}>Reinstate</button></form>}
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-red-700">Delete site…</summary>
                <form action={deleteTenantAction.bind(null, t.id)} className="mt-2 flex gap-2">
                  <input className={`${inputCls} w-64`} name="confirm" placeholder={`Type "${t.slug}" to confirm`} autoComplete="off" required />
                  <button className={btnDangerCls}>Delete site and all its videos</button>
                </form>
              </details>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
