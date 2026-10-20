import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readdir, readFile, rm, stat, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { platformDb } from "./db/client";
import { entitlements } from "./entitlements";
import { getEnv } from "./env";
import { logger } from "./logger";
import { settleQuota } from "./quota";
import { notifyVideo } from "./seo-notify";
import { getContentScanner } from "./safety/scanner";
import { findObjectByPrefix, keys, presignGet, putObject } from "./storage";

const require = createRequire(path.join(process.cwd(), "package.json"));

export class ProcessError extends Error {
  constructor(
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
  }
}

export function ffmpegPath(): string {
  return getEnv().FFMPEG_PATH ?? require("@ffmpeg-installer/ffmpeg").path;
}
export function ffprobePath(): string {
  return getEnv().FFPROBE_PATH ?? require("@ffprobe-installer/ffprobe").path;
}

function run(bin: string, args: string[], opts: { collectStdout?: boolean } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => opts.collectStdout && (out += d));
    p.stderr.on("data", (d) => (err = (err + d).slice(-4000)));
    p.on("error", (e) => reject(new ProcessError(`Could not start ${path.basename(bin)}: ${e.message}`, false)));
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${path.basename(bin)} exited ${code}: ${err.trim().split("\n").slice(-3).join(" | ")}`))));
  });
}

export type Probe = { durationSec: number; width: number; height: number; hasAudio: boolean };

export async function probe(input: string): Promise<Probe> {
  let json: any;
  try {
    const out = await run(ffprobePath(), ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", input], { collectStdout: true });
    json = JSON.parse(out);
  } catch {
    // ffprobe could not parse the container at all: it's not a (valid) media file.
    throw new ProcessError("The file is not a valid video", false);
  }
  const streams: any[] = json.streams ?? [];
  const v = streams.find((s) => s.codec_type === "video" && s.disposition?.attached_pic !== 1);
  if (!v || !v.width || !v.height) throw new ProcessError("The file does not contain a video stream", false);
  const duration = Number(json.format?.duration ?? v.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new ProcessError("Could not determine the video duration", false);
  return { durationSec: Math.round(duration), width: v.width, height: v.height, hasAudio: streams.some((s) => s.codec_type === "audio") };
}

export type Rung = { height: number; videoKbps: number; audioKbps: number };
const LADDER: Rung[] = [
  { height: 360, videoKbps: 800, audioKbps: 96 },
  { height: 720, videoKbps: 2500, audioKbps: 128 },
  { height: 1080, videoKbps: 5000, audioKbps: 192 },
];

/** Renditions allowed by the plan and not larger than the source. Always returns at least one. */
export function chooseLadder(sourceHeight: number, maxResolution: number): Rung[] {
  const rungs = LADDER.filter((r) => r.height <= maxResolution && r.height <= sourceHeight * 1.05);
  if (rungs.length) return rungs;
  const h = Math.max(2, Math.floor(Math.min(sourceHeight, maxResolution) / 2) * 2);
  return [{ height: h, videoKbps: 600, audioKbps: 96 }];
}

async function transcodeRung(input: string, dir: string, rung: Rung, hasAudio: boolean) {
  await mkdir(dir, { recursive: true });
  const args = [
    "-y", "-i", input, "-map", "0:v:0", ...(hasAudio ? ["-map", "0:a:0"] : []),
    "-vf", `scale=-2:${rung.height}`,
    "-c:v", "libx264", "-preset", "veryfast", "-profile:v", "main", "-pix_fmt", "yuv420p",
    "-b:v", `${rung.videoKbps}k`, "-maxrate", `${Math.round(rung.videoKbps * 1.07)}k`, "-bufsize", `${rung.videoKbps * 2}k`,
    "-g", "48", "-keyint_min", "48", "-sc_threshold", "0",
    ...(hasAudio ? ["-c:a", "aac", "-b:a", `${rung.audioKbps}k`, "-ac", "2"] : ["-an"]),
    "-f", "hls", "-hls_time", "6", "-hls_playlist_type", "vod",
    "-hls_segment_filename", path.join(dir, "seg_%05d.ts"), path.join(dir, "index.m3u8"),
  ];
  await run(ffmpegPath(), args);
}

const CONTENT_TYPES: Record<string, string> = { ".m3u8": "application/vnd.apple.mpegurl", ".ts": "video/mp2t", ".jpg": "image/jpeg" };

async function walk(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full, base)));
    else out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out;
}

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  const q = [...items];
  await Promise.all(Array.from({ length: Math.min(n, q.length) }, async () => {
    for (let x = q.shift(); x !== undefined; x = q.shift()) await fn(x);
  }));
}

export type ProcessOutcome = "ready" | "blocked" | "skipped";

/**
 * Shared processing path for BOTH ingest methods. Idempotent: re-running overwrites objects, upserts renditions,
 * and quota settlement is a no-op once READY.
 */
export async function processVideo(tenantId: string, videoId: string): Promise<ProcessOutcome> {
  const video = await platformDb.video.findFirst({ where: { id: videoId, tenantId }, include: { tenant: { include: { plan: true } } } });
  if (!video || ["READY", "BLOCKED", "FAILED"].includes(video.status)) return "skipped";
  const ent = entitlements(video.tenant.plan.key);

  const source = await findObjectByPrefix(`${keys.videoPrefix(tenantId, videoId)}source.`);
  if (!source) throw new ProcessError("The uploaded file could not be found", false);
  const inputUrl = await presignGet(source.key, 6 * 3600);

  const info = await probe(inputUrl);
  if (info.durationSec > ent.maxDurationSec) {
    throw new ProcessError(`The video is longer than your plan allows (${Math.round(ent.maxDurationSec / 3600)} h)`, false);
  }

  // Moderation hook: nothing becomes public before this passes.
  const verdict = await getContentScanner().scan({ tenantId, videoId, sourceUrl: inputUrl, durationSec: info.durationSec, sizeBytes: source.size });
  if (verdict.verdict !== "clean") {
    await platformDb.video.updateMany({
      where: { id: videoId, tenantId },
      data: { status: "BLOCKED", failureReason: verdict.reason ?? (verdict.verdict === "review" ? "Held for moderation review" : "Blocked by content scan") },
    });
    logger.warn({ tenantId, videoId, verdict }, "video blocked by content scanner");
    return "blocked";
  }

  const work = await mkdtemp(path.join(os.tmpdir(), "vp-"));
  try {
    const ladder = chooseLadder(info.height, ent.maxResolution);
    for (const rung of ladder) await transcodeRung(inputUrl, path.join(work, "hls", `${rung.height}p`), rung, info.hasAudio);

    const thumbAt = Math.min(info.durationSec * 0.1, 10);
    await run(ffmpegPath(), ["-y", "-ss", String(thumbAt), "-i", inputUrl, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "3", path.join(work, "thumb.jpg")]);
    await run(ffmpegPath(), ["-y", "-ss", String(thumbAt), "-i", inputUrl, "-frames:v", "1", "-vf", "scale=1280:-2", "-q:v", "3", path.join(work, "thumb-lg.jpg")]);

    const aspect = info.width / info.height;
    const master = ["#EXTM3U", "#EXT-X-VERSION:3"];
    for (const r of ladder) {
      const w = Math.max(2, Math.round((r.height * aspect) / 2) * 2);
      master.push(`#EXT-X-STREAM-INF:BANDWIDTH=${(r.videoKbps + r.audioKbps) * 1000},RESOLUTION=${w}x${r.height}`, `${r.height}p/index.m3u8`);
    }
    await writeFile(path.join(work, "hls", "master.m3u8"), master.join("\n") + "\n");

    // upload everything under the tenant prefix
    const hlsFiles = await walk(path.join(work, "hls"));
    const sizes = new Map<number, number>();
    let derivedBytes = 0;
    await pool(hlsFiles, 4, async (rel) => {
      const full = path.join(work, "hls", rel);
      const size = (await stat(full)).size;
      derivedBytes += size;
      const h = /^(\d+)p\//.exec(rel)?.[1];
      if (h) sizes.set(Number(h), (sizes.get(Number(h)) ?? 0) + size);
      await putObject(keys.hls(tenantId, videoId, rel), await readFile(full), CONTENT_TYPES[path.extname(rel)] ?? "application/octet-stream");
    });
    const thumb = await readFile(path.join(work, "thumb.jpg"));
    derivedBytes += thumb.length;
    await putObject(keys.thumb(tenantId, videoId), thumb, "image/jpeg");
    const thumbLg = await readFile(path.join(work, "thumb-lg.jpg"));
    derivedBytes += thumbLg.length;
    await putObject(keys.thumbLarge(tenantId, videoId), thumbLg, "image/jpeg");

    const finalBytes = source.size + derivedBytes;
    await settleQuota(tenantId, videoId, finalBytes, async (tx) => {
      for (const r of ladder) {
        const data = { tenantId, videoId, height: r.height, bitrateKbps: r.videoKbps + r.audioKbps, playlistPath: keys.hls(tenantId, videoId, `${r.height}p/index.m3u8`), sizeBytes: BigInt(sizes.get(r.height) ?? 0) };
        await tx.videoRendition.upsert({ where: { videoId_height: { videoId, height: r.height } }, update: data, create: data });
      }
      await tx.video.update({
        where: { id: videoId },
        data: {
          status: "READY",
          failureReason: null,
          hlsPath: keys.hls(tenantId, videoId, "master.m3u8"),
          thumbnailPath: keys.thumb(tenantId, videoId),
          durationSec: info.durationSec,
          importProgress: 100,
        },
      });
    });
    logger.info({ tenantId, videoId, renditions: ladder.map((r) => r.height), durationSec: info.durationSec }, "video ready");
    void notifyVideo(tenantId, videoId); // IndexNow: new public video is announced to search engines immediately
    return "ready";
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
