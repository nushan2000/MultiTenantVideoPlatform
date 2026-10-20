import { requireTenant } from "@/lib/access";
import { resolveReportAction } from "../../actions";
import { Card, Flash, btnDangerCls, btnGhostCls } from "@/components/ui";

export default async function Reports({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const a = await requireTenant(slug);
  const reports = await a.db.report.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { video: { select: { id: true, title: true, status: true } } } });
  const canAct = a.role === "OWNER" || a.role === "ADMIN";
  return (
    <>
      <Flash ok={sp.ok} error={sp.error} />
      <Card title="Abuse & copyright reports">
        {reports.length === 0 && <p className="text-sm text-neutral-500">No reports. </p>}
        <ul className="divide-y">
          {reports.map((r) => (
            <li key={r.id} className="py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="mr-2 rounded bg-neutral-200 px-1.5 py-0.5 text-xs">{r.type}</span>
                  <strong>{r.video.title}</strong> <span className="text-neutral-500">({r.video.status.toLowerCase()})</span>
                </div>
                <span className="text-xs text-neutral-500">{r.status} · {r.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap">{r.reason}</p>
              {r.reporterEmail && <p className="text-xs text-neutral-500">Reporter: {r.reporterEmail}</p>}
              {canAct && r.status === "OPEN" && (
                <div className="mt-2 flex gap-2">
                  <form action={resolveReportAction.bind(null, slug, r.id, "takedown")}><button className={btnDangerCls}>Take down video</button></form>
                  <form action={resolveReportAction.bind(null, slug, r.id, "dismiss")}><button className={btnGhostCls}>Dismiss</button></form>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
