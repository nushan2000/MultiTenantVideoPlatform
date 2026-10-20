import { logger } from "./logger";
import { redis } from "./redis";

/**
 * IndexNow: tell Bing, Yandex, Seznam and others the moment a URL is created, changed or removed, instead of waiting to be crawled.
 * One platform-wide key (INDEXNOW_KEY, 8-128 chars [A-Za-z0-9-]); every tenant host serves it at /<key>.txt (see middleware).
 * Disabled when the key is unset (dev). Fire-and-forget: failures are logged, never block the action that triggered them.
 */
const ENDPOINT = "https://api.indexnow.org/indexnow";

export const indexNowKey = () => {
  const k = process.env.INDEXNOW_KEY?.trim();
  return k && /^[A-Za-z0-9-]{8,128}$/.test(k) ? k : null;
};

export async function submitIndexNow(origin: string, paths: string[]): Promise<void> {
  const key = indexNowKey();
  if (!key || paths.length === 0) return;
  try {
    const host = new URL(origin).host;
    // dedupe bursts: the same URL is submitted at most once per minute
    const r = await redis();
    const fresh: string[] = [];
    for (const p of [...new Set(paths)].slice(0, 100)) {
      if ((await r.set(`indexnow:${host}${p}`, "1", "EX", 60, "NX")) === "OK") fresh.push(`${origin}${p}`);
    }
    if (!fresh.length) return;
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host, key, keyLocation: `${origin}/${key}.txt`, urlList: fresh }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok && res.status !== 202) logger.warn({ status: res.status, host }, "IndexNow rejected submission");
  } catch (err) {
    logger.warn({ err: String(err) }, "IndexNow submission failed");
  }
}
