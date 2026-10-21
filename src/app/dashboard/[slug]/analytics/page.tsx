import type { Metadata } from "next";
import Link from "next/link";
import { requireTenant } from "@/lib/access";
import { Card } from "@/components/ui";
import { fillDays, formatBytes, formatWatchTime, type DayPoint } from "@/lib/analytics";
import { bandwidthStatus, monthKey } from "@/lib/bandwidth";

export const metadata: Metadata = { title: "Analytics" };

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {hint && <div className="text-xs text-neutral-500">{hint}</div>}
    </div>
  );
}

/** Daily bars. Inline SVG: no chart library, readable in light and dark, with a text table for assistive tech. */
function Bars({ points }: { points: DayPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.views));
  const w = 720;
  const h = 140;
  const bw = w / points.length;
  return (
    <figure>
      <svg viewBox={`0 0 ${w} ${h + 18}`} role="img" aria-label={`Views per day, last ${points.length} days`} className="w-full">
        {points.map((p, i) => {
          const bh = Math.round((p.views / max) * h);
          return (
            <g key={p.day}>
              <rect x={i * bw + 1} y={h - bh} width={Math.max(1, bw - 2)} height={bh} rx={2} className="fill-blue-600">
                <title>{`${p.day}: ${p.views.toLocaleString()} views`}</title>
              </rect>
            </g>
          );
        })}
        <text x={0} y={h + 14} className="fill-neutral-500" fontSize="11">{points[0]?.day}</text>
        <text x={w} y={h + 14} textAnchor="end" className="fill-neutral-500" fontSize="11">{points[points.length - 1]?.day}</text>
      </svg>
      <figcaption className="sr-only">Peak day: {max} views</figcaption>
    </figure>
  );
}

export default async function Analytics({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = await requireTenant(slug);
  const days = a.ent.analyticsDays;
  const since = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() - (days - 1)));

  const [daily, top, totals, bw, storage, counts] = await Promise.all([
    a.db.videoStatDaily.groupBy({ by: ["day"], where: { day: { gte: since } }, _sum: { views: true, watchSeconds: true } }),
    a.db.videoStatDaily.groupBy({ by: ["videoId"], where: { day: { gte: since } }, _sum: { views: true, watchSeconds: true }, orderBy: { _sum: { views: "desc" } }, take: 10 }),
    a.db.video.aggregate({ where: { status: "READY" }, _sum: { views: true, likes: true }, _count: true }),
    bandwidthStatus(a.tenant.id, a.planKey),
    a.db.storageUsage.findFirst(),
    a.db.comment.count({ where: { status: "PENDING" } }),
  ]);
  const titles = new Map(
    (await a.db.video.findMany({ where: { id: { in: top.map((t) => t.videoId) } }, select: { id: true, title: true } })).map((v) => [v.id, v.title]),
  );
  const points = fillDays(daily.map((d) => ({ day: d.day.toISOString().slice(0, 10), views: d._sum.views ?? 0, watchSeconds: d._sum.watchSeconds ?? 0 })), days);
  const views = points.reduce((s, p) => s + p.views, 0);
  const watch = points.reduce((s, p) => s + p.watchSeconds, 0);
  const storageUsed = Number(storage?.bytesUsed ?? 0n);
  const bwBar = bw.percent >= 90 ? "bg-red-500" : bw.percent >= 70 ? "bg-amber-500" : "bg-green-600";

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={`Views, last ${days} days`} value={views.toLocaleString()} />
        <Stat label="Watch time" value={formatWatchTime(watch)} hint={views ? `${formatWatchTime(Math.round(watch / views))} per view` : undefined} />
        <Stat label="Total views (all time)" value={(totals._sum.views ?? 0).toLocaleString()} hint={`${totals._count} published video${totals._count === 1 ? "" : "s"}`} />
        <Stat label="Likes (all time)" value={(totals._sum.likes ?? 0).toLocaleString()} hint={counts ? `${counts} comment${counts === 1 ? "" : "s"} waiting` : undefined} />
      </div>

      <Card title={`Views per day (last ${days} days)`}>
        <Bars points={points} />
        {a.ent.analyticsDays < 90 && (
          <p className="mt-2 text-xs text-neutral-500">
            Your plan keeps {days} days of history. <Link className="underline" href={`/dashboard/${slug}/billing`}>Premium keeps 90.</Link>
          </p>
        )}
      </Card>

      <Card title="Top videos">
        {top.length === 0 ? (
          <p className="text-sm text-neutral-500">No views yet in this period.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase text-neutral-500"><th className="py-1">Video</th><th className="py-1 text-right">Views</th><th className="py-1 text-right">Watch time</th></tr></thead>
            <tbody>
              {top.map((t) => (
                <tr key={t.videoId} className="border-t">
                  <td className="max-w-0 truncate py-1.5 pr-2">{titles.get(t.videoId) ?? "Deleted video"}</td>
                  <td className="py-1.5 text-right tabular-nums">{(t._sum.views ?? 0).toLocaleString()}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatWatchTime(t._sum.watchSeconds ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Bandwidth & storage">
        <div className="mb-1 flex justify-between text-sm">
          <span>Bandwidth in {monthKey()}</span>
          <span className="tabular-nums">{formatBytes(bw.used)} of {formatBytes(bw.limit)}</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-neutral-200" role="progressbar" aria-valuenow={bw.percent} aria-valuemin={0} aria-valuemax={100}>
          <div className={`h-full ${bwBar}`} style={{ width: `${bw.percent}%` }} />
        </div>
        {bw.over ? (
          <p role="alert" className="mt-2 text-sm text-red-700">You have used this month&apos;s bandwidth, so video playback is paused until next month. <Link className="underline" href={`/dashboard/${slug}/billing`}>Upgrade</Link> to continue now.</p>
        ) : (
          <p className="mt-2 text-xs text-neutral-500">Counts the video and image data your site served this month. Resets on the 1st (UTC).</p>
        )}
        <div className="mt-4 flex justify-between text-sm"><span>Storage used</span><span className="tabular-nums">{formatBytes(storageUsed)} of {formatBytes(a.ent.storageLimitBytes)}</span></div>
      </Card>
    </>
  );
}
