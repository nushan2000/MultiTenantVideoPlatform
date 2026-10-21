import type { Prisma } from "@prisma/client";

// Per-video, per-day counters. Raw upserts keep Video.updatedAt untouched (it drives sitemap <lastmod>).

type Tx = Prisma.TransactionClient;

export async function bumpView(tx: Tx, tenantId: string, videoId: string): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "VideoStatDaily" (id, "tenantId", "videoId", day, views) VALUES (gen_random_uuid()::text, ${tenantId}, ${videoId}, CURRENT_DATE, 1)
    ON CONFLICT ("videoId", day) DO UPDATE SET views = "VideoStatDaily".views + 1`;
}

export async function bumpWatch(tx: Tx, tenantId: string, videoId: string, seconds: number): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "VideoStatDaily" (id, "tenantId", "videoId", day, "watchSeconds") VALUES (gen_random_uuid()::text, ${tenantId}, ${videoId}, CURRENT_DATE, ${seconds})
    ON CONFLICT ("videoId", day) DO UPDATE SET "watchSeconds" = "VideoStatDaily"."watchSeconds" + ${seconds}`;
}

export type DayPoint = { day: string; views: number; watchSeconds: number };
export type TopVideo = { id: string; title: string; views: number; watchSeconds: number };

/** Fill days with no traffic so charts have a continuous axis. */
export function fillDays(rows: DayPoint[], days: number, today = new Date()): DayPoint[] {
  const map = new Map(rows.map((r) => [r.day, r]));
  const out: DayPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i)).toISOString().slice(0, 10);
    out.push(map.get(d) ?? { day: d, views: 0, watchSeconds: 0 });
  }
  return out;
}

export function formatWatchTime(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h ? `${h.toLocaleString()} h ${m} min` : `${m} min`;
}

export function formatBytes(n: number): string {
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)} ${u[i]}`;
}
