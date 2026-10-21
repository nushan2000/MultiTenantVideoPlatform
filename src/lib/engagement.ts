import { createHmac } from "node:crypto";
import { z } from "zod";
import { getEnv } from "./env";
import { stripText } from "./seo";

// Storefront visitors have no accounts. Comments are moderated and rate-limited; likes are one per (video, visitor fingerprint).
// Neither stores a raw IP: only a keyed hash, which is enough to rate-limit and de-duplicate but not to identify anyone.

const hmac = (parts: string[]) => createHmac("sha256", getEnv().AUTH_SECRET).update(parts.join("\u0000")).digest("hex").slice(0, 32);
export const ipHash = (tenantId: string, ip: string) => hmac(["ip", tenantId, ip]);
export const voterHash = (videoId: string, ip: string, userAgent: string) => hmac(["vote", videoId, ip, userAgent.slice(0, 200)]);

export const MAX_LINKS = 2;
export const countLinks = (s: string) => (s.match(/https?:\/\/|www\./gi) ?? []).length;

const text = (min: number, max: number, label: string) =>
  z.string().max(max * 3).transform(stripText).pipe(z.string().min(min, `${label} is too short`).max(max, `${label} is too long (max ${max} characters)`));

export const commentInput = z.object({
  videoId: z.string().min(1),
  name: text(1, 40, "Name"),
  body: text(2, 1000, "Comment"),
  /** honeypot: real visitors never fill this (hidden field); bots do */
  website: z.string().max(200).optional().default(""),
});
export type CommentInput = z.infer<typeof commentInput>;

/** null = fine, otherwise why the comment is refused. */
export function commentProblem(i: Pick<CommentInput, "body" | "name">): string | null {
  if (countLinks(i.body) + countLinks(i.name) > MAX_LINKS) return `Comments can contain at most ${MAX_LINKS} links.`;
  if (/(.)\1{12,}/.test(i.body)) return "That comment looks like spam.";
  return null;
}
