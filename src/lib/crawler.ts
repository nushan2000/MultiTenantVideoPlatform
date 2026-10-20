import dns from "node:dns/promises";
import { redis } from "./redis";

/** Reverse-DNS suffixes the major search engines document for verifying their crawlers. */
const CRAWLER_DOMAINS = [".googlebot.com", ".google.com", ".search.msn.com", ".crawl.yahoo.net", ".yandex.com", ".yandex.ru", ".yandex.net", ".baidu.com", ".baidu.jp", ".duckduckgo.com", ".applebot.apple.com"];
const UA_HINT = /(googlebot|bingbot|bingpreview|slurp|duckduckbot|yandex|baiduspider|applebot|adsbot-google|mediapartners-google|google-inspectiontool|storebot-google)/i;

/**
 * True only for REAL search-engine crawlers: the User-Agent claims to be one AND the IP's reverse DNS ends in the engine's
 * domain AND that hostname resolves back to the same IP (forward-confirmed reverse DNS). A spoofed UA alone never passes.
 * Result cached 24 h per IP. Used to let crawlers read content behind an age gate (otherwise gated sites cannot be indexed).
 */
export async function isVerifiedCrawler(ip: string | null | undefined, userAgent: string | null | undefined, resolver = { reverse: dns.reverse, lookup: dns.lookup }): Promise<boolean> {
  if (!ip || !userAgent || !UA_HINT.test(userAgent)) return false;
  const key = `crawler:${ip}`;
  try {
    const cached = await (await redis()).get(key);
    if (cached !== null) return cached === "1";
  } catch {}
  let ok = false;
  try {
    for (const host of await resolver.reverse(ip)) {
      const h = host.toLowerCase();
      if (!CRAWLER_DOMAINS.some((d) => h.endsWith(d))) continue;
      const fwd = await resolver.lookup(h, { all: true });
      if (fwd.some((a) => a.address === ip)) {
        ok = true;
        break;
      }
    }
  } catch {
    ok = false;
  }
  try {
    await (await redis()).set(key, ok ? "1" : "0", "EX", 24 * 3600);
  } catch {}
  return ok;
}
