import { execFileSync } from "node:child_process";
import http from "node:http";
import net from "node:net";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bumpView, bumpWatch, fillDays, formatBytes, formatWatchTime } from "@/lib/analytics";
import { addBandwidth, bandwidthStatus, bandwidthUsed, flushBandwidth, monthKey } from "@/lib/bandwidth";
import { baseClient, platformDb, tenantDb, tenantTx } from "@/lib/db/client";
import { PLAN_CONFIG } from "@/lib/entitlements";
import { commentInput, commentProblem, countLinks } from "@/lib/engagement";
import { invalidateMediaCache, mediaAccess } from "@/lib/media-cache";
import { playlistData, publicPlaylists, uniqueSlug } from "@/lib/playlists";
import { redis } from "@/lib/redis";
import { clamdScan, composeScanners, webhookScanner } from "@/lib/safety/providers";
import type { ContentScanner } from "@/lib/safety/scanner";
import { publishDueVideos } from "@/lib/scheduling";
import { buildWhisperCommand, splitCommand } from "@/lib/transcribe";
import { ffmpegPath, imageToThumbs } from "@/lib/transcode";
import { resolveHost } from "@/lib/tenancy/resolve";

// Integration: needs `pnpm infra` (postgres + redis). Covers the product features: engagement, analytics, bandwidth,
// playlists, scheduling, scanning and transcription helpers.
const run = Date.now().toString(36);
let planId: string;
let a: string;
let b: string;

const video = (tenantId: string, data: Record<string, unknown> = {}) =>
  platformDb.video.create({ data: { tenantId, title: "Clip", ingestMethod: "DIRECT", status: "READY", visibility: "PUBLIC", ...data } as never });

beforeAll(async () => {
  planId = (await platformDb.plan.upsert({ where: { key: "free" }, update: {}, create: { key: "free", name: "Free" } })).id;
  a = (await platformDb.tenant.create({ data: { slug: `prod-a-${run}`, name: "A", planId } })).id;
  b = (await platformDb.tenant.create({ data: { slug: `prod-b-${run}`, name: "B", planId } })).id;
});

afterAll(async () => {
  const r = await redis();
  await r.del(`bw:${a}:${monthKey()}`, `bw:${b}:${monthKey()}`);
  await platformDb.tenant.deleteMany({ where: { slug: { endsWith: `-${run}` } } });
  await baseClient.$disconnect();
});

describe("comments and likes", () => {
  it("validates input, strips markup, limits links and traps bots", () => {
    const ok = commentInput.parse({ videoId: "v", name: " <b>Sam</b> ", body: "Nice <script>x</script> video" });
    expect(ok.name).toBe("Sam");
    expect(ok.body).not.toContain("<");
    expect(() => commentInput.parse({ videoId: "v", name: "Sam", body: "x" })).toThrow();
    expect(() => commentInput.parse({ videoId: "v", name: "Sam", body: "y".repeat(1001) })).toThrow();
    expect(countLinks("see https://a.com and www.b.com and http://c.com")).toBe(3);
    expect(commentProblem({ name: "Sam", body: "http://a.com http://b.com http://c.com" })).toMatch(/links/);
    expect(commentProblem({ name: "Sam", body: "great video, thanks" })).toBeNull();
    expect(commentProblem({ name: "Sam", body: "aaaaaaaaaaaaaaaaaaaaa" })).toMatch(/spam/);
  });

  it("comments default to PENDING and are isolated per tenant (layer 1 + RLS)", async () => {
    const va = await video(a);
    const c = await tenantDb(a).comment.create({ data: { videoId: va.id, authorName: "Sam", body: "hello" } as never });
    expect(c.status).toBe("PENDING");
    expect(await tenantDb(b).comment.count()).toBe(0);
    expect(await tenantDb(a).comment.count()).toBe(1);
    // no context at all: RLS fails closed
    expect(await baseClient.comment.count()).toBe(0);
  });

  it("a visitor can like a video once; the counter follows", async () => {
    const v = await video(a);
    await tenantTx(a, async (tx) => {
      await tx.videoLike.create({ data: { tenantId: a, videoId: v.id, voterHash: "h1" } });
      await tx.$executeRaw`UPDATE "Video" SET likes = likes + 1 WHERE id = ${v.id}`;
    });
    await expect(tenantTx(a, (tx) => tx.videoLike.create({ data: { tenantId: a, videoId: v.id, voterHash: "h1" } }))).rejects.toThrow();
    expect((await platformDb.video.findUnique({ where: { id: v.id } }))!.likes).toBe(1);
  });
});

describe("analytics", () => {
  it("accumulates views and watch seconds per video per day without touching updatedAt", async () => {
    const v = await video(a);
    const before = v.updatedAt;
    await tenantTx(a, async (tx) => {
      await bumpView(tx, a, v.id);
      await bumpView(tx, a, v.id);
      await bumpWatch(tx, a, v.id, 45);
      await bumpWatch(tx, a, v.id, 15);
    });
    const rows = await tenantDb(a).videoStatDaily.findMany({ where: { videoId: v.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].views).toBe(2);
    expect(rows[0].watchSeconds).toBe(60);
    expect((await platformDb.video.findUnique({ where: { id: v.id } }))!.updatedAt).toEqual(before);
    expect(await tenantDb(b).videoStatDaily.count({ where: { videoId: v.id } })).toBe(0);
  });

  it("fills quiet days and formats numbers", () => {
    const pts = fillDays([{ day: "2026-10-20", views: 5, watchSeconds: 10 }], 3, new Date(Date.UTC(2026, 9, 21)));
    expect(pts.map((p) => p.day)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21"]);
    expect(pts.map((p) => p.views)).toEqual([0, 5, 0]);
    expect(formatWatchTime(59)).toBe("59s");
    expect(formatWatchTime(3700)).toBe("1 h 1 min");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });
});

describe("bandwidth", () => {
  it("meters bytes, persists them, and reports when a plan limit is hit", async () => {
    await addBandwidth(a, 1000);
    await addBandwidth(a, 500);
    expect(await bandwidthUsed(a)).toBe(1500);
    await flushBandwidth();
    const row = await platformDb.bandwidthUsage.findUnique({ where: { tenantId_month: { tenantId: a, month: monthKey() } } });
    expect(Number(row!.bytes)).toBe(1500);
    // a flushed Redis must not reset the meter
    await (await redis()).del(`bw:${a}:${monthKey()}`);
    await addBandwidth(a, 100);
    expect(await bandwidthUsed(a)).toBe(1600);

    const limit = PLAN_CONFIG.free.bandwidthLimitBytes;
    expect((await bandwidthStatus(a, "free")).over).toBe(false);
    await addBandwidth(b, limit + 1);
    expect((await bandwidthStatus(b, "free")).over).toBe(true);
    expect((await bandwidthStatus(b, "premium")).over).toBe(false);
  });
});

describe("media access cache", () => {
  it("serves the cached decision briefly and refreshes after invalidation", async () => {
    const v = await video(a);
    expect((await mediaAccess(a, v.id))?.visibility).toBe("PUBLIC");
    await platformDb.video.update({ where: { id: v.id }, data: { visibility: "PRIVATE" } });
    expect((await mediaAccess(a, v.id))?.visibility).toBe("PUBLIC"); // still cached
    await invalidateMediaCache(a, v.id);
    expect((await mediaAccess(a, v.id))?.visibility).toBe("PRIVATE");
    expect(await mediaAccess(a, "missing")).toBeNull();
    expect(await mediaAccess(b, v.id)).toBeNull(); // another tenant's id is never found
  });
});

describe("playlists", () => {
  it("makes unique slugs", () => {
    expect(uniqueSlug("My List!", new Set())).toBe("my-list");
    expect(uniqueSlug("My List", new Set(["my-list", "my-list-2"]))).toBe("my-list-3");
  });

  it("returns public videos in the owner's order, hides private ones and unpublished lists", async () => {
    const [v1, v2, v3] = [await video(a, { title: "One" }), await video(a, { title: "Two" }), await video(a, { title: "Hidden", visibility: "PRIVATE" })];
    const db = tenantDb(a);
    const pl = await db.playlist.create({ data: { title: "Course", slug: "course", description: "d" } as never });
    await db.playlistItem.createMany({ data: [v2, v3, v1].map((v, position) => ({ tenantId: a, playlistId: pl.id, videoId: v.id, position })) });
    const tenant = (await resolveHost(`prod-a-${run}.localhost`))!;
    expect(tenant).toBeTruthy();
    const data = await playlistData(tenant, "course");
    expect(data!.videos.map((v) => v.title)).toEqual(["Two", "One"]);
    expect((await publicPlaylists(a, 10, 2)).map((p) => p.slug)).toContain("course");
    expect((await publicPlaylists(a, 10, 3)).map((p) => p.slug)).not.toContain("course");
    await db.playlist.updateMany({ where: { id: pl.id }, data: { published: false } });
    expect(await playlistData(tenant, "course")).toBeNull();
    // isolation
    expect(await tenantDb(b).playlist.count()).toBe(0);
  });
});

describe("scheduled publishing", () => {
  it("publishes due videos, leaves future ones, and never publishes a blocked video", async () => {
    const past = new Date(Date.now() - 60_000);
    const due = await video(a, { visibility: "PRIVATE", publishAt: past });
    const later = await video(a, { visibility: "PRIVATE", publishAt: new Date(Date.now() + 3600_000) });
    const blocked = await video(a, { visibility: "PRIVATE", publishAt: past, status: "BLOCKED" });
    await publishDueVideos();
    const get = (id: string) => platformDb.video.findUnique({ where: { id } });
    expect(await get(due.id)).toMatchObject({ visibility: "PUBLIC", publishAt: null });
    expect(await get(later.id)).toMatchObject({ visibility: "PRIVATE" });
    expect((await get(later.id))!.publishAt).not.toBeNull();
    expect(await get(blocked.id)).toMatchObject({ visibility: "PRIVATE", publishAt: null });
  });
});

describe("content scanning", () => {
  /** Minimal clamd: reads INSTREAM chunks, answers like the real daemon. */
  function fakeClamd(answer: (bytes: number, content: Buffer) => string) {
    return new Promise<{ port: number; close: () => void }>((resolve) => {
      const server = net.createServer((sock) => {
        let buf = Buffer.alloc(0);
        sock.on("data", (d) => {
          buf = Buffer.concat([buf, d]);
          const cmd = "zINSTREAM\0";
          if (buf.length < cmd.length || buf.subarray(0, cmd.length).toString() !== cmd) return;
          let off = cmd.length;
          const parts: Buffer[] = [];
          for (;;) {
            if (buf.length < off + 4) return;
            const len = buf.readUInt32BE(off);
            if (len === 0) break;
            if (buf.length < off + 4 + len) return;
            parts.push(buf.subarray(off + 4, off + 4 + len));
            off += 4 + len;
          }
          const content = Buffer.concat(parts);
          sock.end(answer(content.length, content) + "\0");
        });
      });
      server.listen(0, "127.0.0.1", () => resolve({ port: (server.address() as AddressInfo).port, close: () => server.close() }));
    });
  }
  const chunks = (s: string) => Readable.from([Buffer.from(s.slice(0, 5)), Buffer.from(s.slice(5))]);

  it("clamd: clean, infected and too-large answers", async () => {
    const clean = await fakeClamd(() => "stream: OK");
    expect(await clamdScan("127.0.0.1", clean.port, chunks("hello world, a harmless file"))).toEqual({ status: "clean" });
    clean.close();
    const bad = await fakeClamd((_n, c) => (c.toString().includes("EICAR") ? "stream: Eicar-Test-Signature FOUND" : "stream: OK"));
    expect(await clamdScan("127.0.0.1", bad.port, chunks("xxEICARxx"))).toEqual({ status: "infected", signature: "Eicar-Test-Signature" });
    bad.close();
    const big = await fakeClamd(() => "INSTREAM size limit exceeded. ERROR");
    expect(await clamdScan("127.0.0.1", big.port, chunks("data"))).toEqual({ status: "too_large" });
    big.close();
    await expect(clamdScan("127.0.0.1", 1, chunks("data"), 2000)).rejects.toThrow(/clamd/);
  });

  it("webhook scanner: verdicts, bad answers and composition", async () => {
    let reply: { code: number; body: unknown } = { code: 200, body: { verdict: "clean" } };
    let seenAuth = "";
    const server = http.createServer((req, res) => {
      seenAuth = String(req.headers.authorization);
      res.writeHead(reply.code, { "content-type": "application/json" }).end(JSON.stringify(reply.body));
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/scan`;
    const input = { tenantId: a, videoId: "v", sourceUrl: "http://x/y", durationSec: 1, sizeBytes: 1 };
    const s = webhookScanner(url, "tok");
    expect(await s.scan(input)).toEqual({ verdict: "clean", reason: undefined });
    expect(seenAuth).toBe("Bearer tok");
    reply = { code: 200, body: { verdict: "blocked", reason: "match" } };
    expect(await s.scan(input)).toEqual({ verdict: "blocked", reason: "match" });
    reply = { code: 200, body: { verdict: "maybe" } };
    await expect(s.scan(input)).rejects.toThrow(/unknown verdict/);
    reply = { code: 500, body: {} };
    await expect(s.scan(input)).rejects.toThrow(/HTTP 500/);
    server.close();

    const clean: ContentScanner = { name: "c", scan: async () => ({ verdict: "clean" }) };
    const review: ContentScanner = { name: "r", scan: async () => ({ verdict: "review" }) };
    expect(await composeScanners([clean, clean]).scan(input)).toEqual({ verdict: "clean" });
    expect(await composeScanners([clean, review]).scan(input)).toEqual({ verdict: "review", reason: "Flagged by r" });
  });
});

describe("transcription helpers", () => {
  it("splits a command template without a shell and fills the placeholders", () => {
    expect(splitCommand('/opt/w/whisper-cli -m "/opt/my models/base.bin" -f {input} -ovtt -of {output}')).toEqual([
      "/opt/w/whisper-cli", "-m", "/opt/my models/base.bin", "-f", "{input}", "-ovtt", "-of", "{output}",
    ]);
    const c = buildWhisperCommand("whisper -l {lang} -f {input} -of {output}", { input: "/t/a b.wav", output: "/t/out", lang: "en" });
    expect(c).toEqual({ bin: "whisper", args: ["-l", "en", "-f", "/t/a b.wav", "-of", "/t/out"] });
    expect(() => buildWhisperCommand("whisper -f nothing", { input: "i", output: "o", lang: "en" })).toThrow(/\{input\}/);
    expect(() => buildWhisperCommand("   ", { input: "i", output: "o", lang: "en" })).toThrow();
  });
});

describe("custom thumbnails", () => {
  it("re-encodes an uploaded image into the two JPEG sizes", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "thumb-test-"));
    try {
      const png = path.join(tmp, "in.png");
      execFileSync(ffmpegPath(), ["-y", "-f", "lavfi", "-i", "testsrc=size=1920x1080:rate=1:duration=1", "-frames:v", "1", png], { stdio: "ignore" });
      const { small, large } = await imageToThumbs(readFileSync(png), "png");
      for (const img of [small, large]) expect([...img.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
      expect(large.length).toBeGreaterThan(small.length);
      await expect(imageToThumbs(Buffer.from("not an image"), "png")).rejects.toThrow(/could not be processed/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
