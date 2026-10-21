import { getEnv } from "../env";
import { logger } from "../logger";
import { missingScanner, scannersFromEnv } from "./providers";

export type ScanInput = {
  tenantId: string;
  videoId: string;
  /** Short-lived URL to the source file (server-internal) so a provider can fetch/hash it. */
  sourceUrl: string;
  durationSec: number;
  sizeBytes: number;
};
export type ScanVerdict = { verdict: "clean" | "blocked" | "review"; reason?: string };

/**
 * Plug-in point for hash-matching / CSAM detection / moderation services. It runs for BOTH ingest methods,
 * after ffprobe validation and BEFORE a video can become READY (publicly playable).
 *
 * `blocked` and `review` both keep the video non-public (status BLOCKED). Throwing is treated as a transient
 * failure and retried; the video never becomes public on error.
 *
 * !! PRODUCTION: this repository ships only a STUB that approves everything. A real provider MUST be integrated
 * !! before launch (e.g. PhotoDNA / Google CSAI Match / Cloudflare CSAM scanning + a moderation API), and
 * !! legal review is needed for uploader identity / record-keeping duties (e.g. 18 U.S.C. 2257-style rules).
 */
export interface ContentScanner {
  readonly name: string;
  scan(input: ScanInput): Promise<ScanVerdict>;
}

export const stubScanner: ContentScanner = {
  name: "stub",
  async scan(input) {
    const level = process.env.NODE_ENV === "production" ? "error" : "warn";
    logger[level]({ videoId: input.videoId }, "ContentScanner is a STUB: video approved without moderation. Integrate a real provider before production.");
    return { verdict: "clean" };
  },
};

let active: ContentScanner | null = null;
export const setContentScanner = (s: ContentScanner | null) => {
  active = s;
};

/**
 * The scanner in use: whatever is configured in the environment (ClamAV and/or a moderation webhook, see providers.ts),
 * else the stub. With SCANNER_REQUIRED=true and nothing configured, nothing is ever approved.
 */
export function getContentScanner(): ContentScanner {
  if (!active) {
    active = scannersFromEnv() ?? (getEnv().SCANNER_REQUIRED === "true" ? missingScanner : stubScanner);
    logger.info({ scanner: active.name }, "content scanner selected");
  }
  return active;
}
