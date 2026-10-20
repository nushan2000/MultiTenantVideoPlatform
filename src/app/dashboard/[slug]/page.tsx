import Link from "next/link";
import { requireTenant } from "@/lib/access";
import { Card, Flash, formatBytes } from "@/components/ui";

export default async function Overview({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const a = await requireTenant(slug);
  const [usage, counts, openReports] = await Promise.all([
    a.db.storageUsage.findFirst(),
    a.db.video.groupBy({ by: ["status"], _count: true }),
    a.db.report.count({ where: { status: "OPEN" } }),
  ]);
  const used = Number(usage?.bytesUsed ?? 0);
  const reserved = Number(usage?.bytesReserved ?? 0);
  const limit = a.ent.storageLimitBytes;
  const pct = Math.min(100, ((used + reserved) / limit) * 100);
  const total = counts.reduce((s, c) => s + c._count, 0);
  return (
    <>
      <Flash ok={sp.ok} error={sp.error} />
      <Card title="Storage">
        <div className="h-3 overflow-hidden rounded-full bg-neutral-200" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
          <div className={`h-full ${pct > 90 ? "bg-red-500" : "bg-blue-600"}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-sm text-neutral-600">
          {formatBytes(used)} used{reserved ? ` + ${formatBytes(reserved)} reserved for uploads in progress` : ""} of {formatBytes(limit)}
          {pct >= 100 && " — uploads and imports are blocked until you free space or upgrade."}
        </p>
      </Card>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card title="Videos"><p className="text-3xl font-bold">{total}</p><p className="text-sm text-neutral-500">{a.ent.maxVideos === Infinity ? "unlimited on your plan" : `of ${a.ent.maxVideos}`}</p><Link href={`/dashboard/${slug}/videos`} className="text-sm text-blue-600 underline">Manage videos</Link></Card>
        <Card title="Plan"><p className="text-3xl font-bold capitalize">{a.planKey}</p><Link href={`/dashboard/${slug}/billing`} className="text-sm text-blue-600 underline">Plan & billing</Link></Card>
        <Card title="Open reports"><p className="text-3xl font-bold">{openReports}</p><Link href={`/dashboard/${slug}/reports`} className="text-sm text-blue-600 underline">Reports inbox</Link></Card>
      </div>
    </>
  );
}
