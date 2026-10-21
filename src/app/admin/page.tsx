import Link from "next/link";
import { requireSuperAdmin } from "@/lib/access";
import { platformDb } from "@/lib/db/client";
import { adminReportAction, blockVideoAction } from "./actions";
import { Card, Flash, btnDangerCls, btnGhostCls } from "@/components/ui";

import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default async function Admin({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  await requireSuperAdmin();
  const [counts, reports, audit, blockable] = await Promise.all([
    Promise.all([platformDb.user.count(), platformDb.tenant.count(), platformDb.video.count(), platformDb.customDomain.count({ where: { status: "ACTIVE" } })]),
    platformDb.report.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "asc" }, take: 100, include: { video: { select: { id: true, title: true, status: true } }, tenant: { select: { slug: true } } } }),
    platformDb.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    platformDb.video.findMany({ where: { status: { in: ["READY", "PROCESSING"] } }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, title: true, tenant: { select: { slug: true } } } }),
  ]);
  return (
    <>
      <Flash ok={sp.ok} error={sp.error} />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([["Users", counts[0], "/admin/users"], ["Sites", counts[1], "/admin/sites"], ["Videos", counts[2], "/admin/sites"], ["Live domains", counts[3], "/admin/domains"]] as const).map(([label, n, href]) => (
          <Link key={label} href={href} className="rounded-lg border border-neutral-200 bg-white p-4 hover:bg-neutral-50"><div className="text-2xl font-bold">{n}</div><div className="text-sm text-neutral-500">{label}</div></Link>
        ))}
      </div>

      <Card title={`Report queue (${reports.length} open)`}>
        {reports.length === 0 && <p className="text-sm text-neutral-500">Nothing to review.</p>}
        <ul className="divide-y text-sm">
          {reports.map((r) => (
            <li key={r.id} className="py-3">
              <div><span className="mr-2 rounded bg-neutral-200 px-1.5 py-0.5 text-xs">{r.type}</span><strong>{r.video.title}</strong> · {r.tenant.slug} · {r.video.status.toLowerCase()}</div>
              <p className="mt-1 whitespace-pre-wrap">{r.reason}</p>
              <div className="mt-2 flex gap-2">
                <form action={adminReportAction.bind(null, r.id, "takedown")}><button className={btnDangerCls}>Take down</button></form>
                <form action={adminReportAction.bind(null, r.id, "dismiss")}><button className={btnGhostCls}>Dismiss</button></form>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Block a video (latest)">
        <ul className="text-sm">
          {blockable.map((v) => (
            <li key={v.id} className="flex items-center justify-between border-t py-1.5"><span>{v.title} <span className="text-neutral-500">· {v.tenant.slug}</span></span>
              <form action={blockVideoAction.bind(null, v.id)}><button className={btnDangerCls}>Block</button></form></li>
          ))}
        </ul>
      </Card>

      <Card title="Audit log">
        <table className="w-full text-left text-xs">
          <thead><tr className="text-neutral-500"><th>When</th><th>Action</th><th>Tenant</th><th>Target</th><th>IP</th></tr></thead>
          <tbody>
            {audit.map((l) => (
              <tr key={l.id} className="border-t"><td className="py-1">{l.createdAt.toISOString().slice(0, 19).replace("T", " ")}</td><td>{l.action}</td><td>{l.tenantId?.slice(-6) ?? ""}</td><td className="max-w-[14rem] truncate">{l.target}</td><td>{l.ip}</td></tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
