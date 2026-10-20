import http from "node:http";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { baseClient, platformDb, tenantDb } from "@/lib/db/client";
import { directUpload, getUploadSession } from "@/lib/ingest/direct";
import { transcodeQueue } from "@/lib/ingest/queues";
import { urlImport } from "@/lib/ingest/url";
import { runImport } from "@/lib/import/run";
import { QuotaError, reserveQuota, releaseReservation } from "@/lib/quota";
import { completeMultipart, deletePrefix, getObject, headObject, keys, presignPart, putObject } from "@/lib/storage";
import { ffmpegPath, processVideo, ProcessError, chooseLadder } from "@/lib/transcode";
import { defaultPolicy } from "@/lib/ssrf";

// Integration: needs `pnpm infra` (postgres + redis + s3). Real ffmpeg, real multipart upload, real quota rows.
const run = Date.now().toString(36);
let tenantId: string, userId: string, plan: { id: string };
let mp4: Buffer;
let tmp: string;

const ctx = () => ({ tenantId, userId, planKey: "free", ip: "127.0.0.1" });

async function newTenant(slug: string) {
  return (await platformDb.tenant.create({ data: { slug: `${slug}-${run}`, name: slug, planId: plan.id } })).id;
}

beforeAll(async () => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "pipeline-test-"));
  const file = path.join(tmp, "in.mp4");
  execFileSync(ffmpegPath(), [
    "-y", "-f", "lavfi", "-i", "testsrc=size=1280x720:rate=24:duration=4", "-f", "lavfi", "-i", "sine=frequency=440:duration=4",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", file,
  ], { stdio: "ignore" });
  mp4 = readFileSync(file);

  plan = await platformDb.plan.upsert({ where: { key: "free" }, update: {}, create: { key: "free", name: "Free" } });
  tenantId = await newTenant("pipe");
  userId = (await platformDb.user.create({ data: { email: `pipe-${run}@example.com`, passwordHash: "x", termsAcceptedAt: new Date() } })).id;
});

afterAll(async () => {
  await deletePrefix(keys.tenantPrefix(tenantId)).catch(() => {});
  await platformDb.tenant.deleteMany({ where: { slug: { endsWith: `-${run}` } } });
  await platformDb.user.deleteMany({ where: { id: userId } });
  rmSync(tmp, { recursive: true, force: true });
  await baseClient.$disconnect();
});

describe("ladder", () => {
  it("respects plan resolution and source height", () => {
    expect(chooseLadder(1080, 720).map((r) => r.height)).toEqual([360, 720]);
    expect(chooseLadder(1080, 1080).map((r) => r.height)).toEqual([360, 720, 1080]);
    expect(chooseLadder(480, 1080).map((r) => r.height)).toEqual([360]);
    expect(chooseLadder(240, 1080).map((r) => r.height)).toEqual([240]);
  });
});

describe("Method A: direct multipart upload -> shared processing", () => {
  it("init -> presigned part PUT -> complete -> transcode -> READY with quota settled", async () => {
    const init = await directUpload.start(ctx(), { filename: "clip.mp4", sizeBytes: mp4.length, contentType: "video/mp4", title: "Clip" });
    expect(init.totalParts).toBe(1);

    // quota reserved while uploading
    let usage = await tenantDb(tenantId).storageUsage.findFirst();
    expect(Number(usage!.bytesReserved)).toBe(mp4.length);

    const session = (await getUploadSession(init.videoId))!;
    const url = await presignPart(session.key, session.uploadId, 1);
    const put = await fetch(url, { method: "PUT", body: new Uint8Array(mp4) });
    expect(put.ok).toBe(true);
    const etag = put.headers.get("etag")!;
    expect(etag).toBeTruthy();
    await completeMultipart(session.key, session.uploadId, [{ PartNumber: 1, ETag: etag }]);
    expect((await headObject(session.key))!.size).toBe(mp4.length);

    await platformDb.video.update({ where: { id: init.videoId }, data: { status: "PROCESSING" } });
    expect(await processVideo(tenantId, init.videoId)).toBe("ready");

    const v = await tenantDb(tenantId).video.findFirst({ where: { id: init.videoId }, include: { renditions: true } });
    expect(v!.status).toBe("READY");
    expect(v!.durationSec).toBeGreaterThanOrEqual(3);
    expect(v!.renditions.map((r) => r.height).sort()).toEqual([360, 720]); // free plan: max 720p
    const master = (await getObject(v!.hlsPath!)).Body!;
    const text = await master.transformToString();
    expect(text).toContain("360p/index.m3u8");
    expect(text).toContain("720p/index.m3u8");
    expect(text).not.toContain("1080p");
    expect(await headObject(v!.thumbnailPath!)).not.toBeNull();
    expect(await headObject(keys.thumbLarge(tenantId, v!.id))).not.toBeNull(); // 1280px poster for og:image / rich results
    expect(await headObject(keys.hls(tenantId, v!.id, "720p/seg_00000.ts"))).not.toBeNull();

    usage = await tenantDb(tenantId).storageUsage.findFirst();
    expect(Number(usage!.bytesReserved)).toBe(0);
    expect(Number(usage!.bytesUsed)).toBe(Number(v!.sizeBytes));
    expect(Number(usage!.bytesUsed)).toBeGreaterThan(mp4.length);

    // idempotent: running the job again changes nothing
    expect(await processVideo(tenantId, v!.id)).toBe("skipped");
    const again = await tenantDb(tenantId).storageUsage.findFirst();
    expect(again!.bytesUsed).toBe(usage!.bytesUsed);
  });

  it("enforces per-upload size and video-count limits at init", async () => {
    await expect(directUpload.start(ctx(), { filename: "big.mp4", sizeBytes: 501 * 1024 ** 2, contentType: "video/mp4" })).rejects.toMatchObject({ code: "too_large" });
    await expect(directUpload.start(ctx(), { filename: "x.pdf", sizeBytes: 100, contentType: "application/pdf" })).rejects.toMatchObject({ code: "not_video" });
  });

  it("a non-video file fails permanently (no retry)", async () => {
    const t = await newTenant("junk");
    const v = await tenantDb(t).video.create({ data: { title: "junk", status: "PROCESSING", ingestMethod: "DIRECT", sizeBytes: 10n } as any });
    await putObject(keys.source(t, v.id, "mp4"), Buffer.from("this is not a video"), "video/mp4");
    await expect(processVideo(t, v.id)).rejects.toMatchObject({ retryable: false });
    await expect(processVideo(t, v.id)).rejects.toBeInstanceOf(ProcessError);
  });
});

describe("quota reservation", () => {
  it("concurrent reservations cannot exceed the plan limit", async () => {
    const t = await newTenant("quota");
    const GB = 1024 ** 3;
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => reserveQuota(t, 1 * GB, 5 * GB)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    expect(results.filter((r) => r.status === "rejected").every((r: any) => r.reason instanceof QuotaError)).toBe(true);
    const u = await tenantDb(t).storageUsage.findFirst();
    expect(Number(u!.bytesReserved)).toBe(5 * GB);
  });

  it("partial reservations grant what fits; release is idempotent", async () => {
    const t = await newTenant("partial");
    const MB = 1024 ** 2;
    await reserveQuota(t, 4 * 1024 * MB, 5 * 1024 * MB);
    const granted = await reserveQuota(t, 500 * MB, 5 * 1024 * MB, true);
    expect(granted).toBe(500 * MB);
    const v = await tenantDb(t).video.create({ data: { title: "r", status: "IMPORTING", ingestMethod: "URL", sizeBytes: BigInt(granted) } as any });
    await releaseReservation(t, v.id);
    await releaseReservation(t, v.id); // second call must be a no-op
    const u = await tenantDb(t).storageUsage.findFirst();
    expect(Number(u!.bytesReserved)).toBe(4 * 1024 * MB);
  });
});

describe("Method B: URL import -> same shared path", () => {
  let server: http.Server;
  let port: number;
  const policy = () =>
    defaultPolicy({ allowedPorts: [port], isAddressAllowed: (ip) => ip === "127.0.0.1", resolve: async () => ["127.0.0.1"] });

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === "/clip.mp4") {
        res.writeHead(200, { "content-type": "video/mp4", "content-length": String(mp4.length) });
        return req.method === "HEAD" ? res.end() : res.end(mp4);
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => server.close());

  it("rejects the request without rights confirmation, and private URLs at the API", async () => {
    await expect(urlImport.start(ctx(), { url: "https://example.com/a.mp4", rightsConfirmed: false })).rejects.toMatchObject({ code: "rights_required" });
    const r = await urlImport.start(ctx(), { urls: ["http://169.254.169.254/a.mp4", "http://localhost/a.mp4", "ftp://x.com/a.mp4"], rightsConfirmed: true });
    expect(r.items.every((i) => i.error && !i.videoId)).toBe(true);
  });

  it("enforces the plan's batch limit", async () => {
    const urls = Array.from({ length: 6 }, (_, i) => `https://example.com/${i}.mp4`);
    await expect(urlImport.start(ctx(), { urls, rightsConfirmed: true })).rejects.toMatchObject({ code: "batch_limit" });
  });

  it("creates the IMPORTING video, downloads, hands off to transcode, and processes to READY", async () => {
    const r = await urlImport.start(ctx(), { url: "https://example.com/clip.mp4", rightsConfirmed: true });
    const item = r.items[0];
    expect(item.videoId).toBeTruthy();
    const created = await platformDb.video.findUnique({ where: { id: item.videoId! } });
    expect(created).toMatchObject({ status: "IMPORTING", ingestMethod: "URL", visibility: "PUBLIC" });
    expect(created!.rightsConfirmedAt).toBeTruthy();

    // point the stored URL at the local mock server (the API-level guard rightly refused loopback above)
    await platformDb.video.update({ where: { id: item.videoId! }, data: { sourceUrl: `http://good.test:${port}/clip.mp4` } });
    expect(await runImport(tenantId, item.videoId!, { policy: policy() })).toBe("done");

    const processing = await platformDb.video.findUnique({ where: { id: item.videoId! } });
    expect(processing!.status).toBe("PROCESSING");
    expect(Number(processing!.sizeBytes)).toBe(mp4.length); // reservation trued up to the real size

    expect(await processVideo(tenantId, item.videoId!)).toBe("ready");
    const ready = await platformDb.video.findUnique({ where: { id: item.videoId! } });
    expect(ready!.status).toBe("READY");
    await transcodeQueue().remove(`transcode-${item.videoId}`).catch(() => {});
  });

  it("a failed import is FAILED with a human reason and gives the quota back", async () => {
    const before = Number((await tenantDb(tenantId).storageUsage.findFirst())!.bytesReserved);
    const r = await urlImport.start(ctx(), { url: "https://example.com/missing.mp4", rightsConfirmed: true });
    const id = r.items[0].videoId!;
    await platformDb.video.update({ where: { id }, data: { sourceUrl: `http://good.test:${port}/missing.mp4` } });
    const { failImport } = await import("@/lib/import/run");
    const err = await runImport(tenantId, id, { policy: policy() }).catch((e) => e);
    await failImport(tenantId, id, err);
    const v = await platformDb.video.findUnique({ where: { id } });
    expect(v!.status).toBe("FAILED");
    expect(v!.failureReason).toMatch(/refused|reach/i);
    expect(Number((await tenantDb(tenantId).storageUsage.findFirst())!.bytesReserved)).toBe(before);
  });
});
