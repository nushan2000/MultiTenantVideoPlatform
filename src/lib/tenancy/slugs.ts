import { z } from "zod";

/** Subdomains that must never be claimable by a tenant. */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "www", "app", "api", "admin", "administrator", "root", "mail", "email", "smtp", "imap", "pop",
  "ftp", "cname", "dns", "ns", "ns1", "ns2", "cdn", "static", "assets", "media", "img", "images",
  "video", "videos", "stream", "dashboard", "console", "portal", "login", "logout", "signin",
  "signup", "register", "auth", "oauth", "sso", "account", "accounts", "billing", "pay",
  "payments", "checkout", "stripe", "status", "help", "support", "docs", "blog", "news", "about",
  "contact", "legal", "terms", "privacy", "dmca", "abuse", "security", "staging", "dev", "test",
  "demo", "sandbox", "internal", "platform", "localhost", "web", "m", "s3", "minio", "storage",
]);

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$/;

export type SlugCheck = { ok: true } | { ok: false; reason: "format" | "reserved" };

export function checkSlug(slug: string): SlugCheck {
  if (!SLUG_RE.test(slug) || slug.includes("--") || slug.startsWith("xn--")) {
    return { ok: false, reason: "format" };
  }
  if (RESERVED_SLUGS.has(slug)) return { ok: false, reason: "reserved" };
  return { ok: true };
}

/** 3-30 chars, lowercase letters/digits/hyphens, no leading/trailing hyphen. */
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .superRefine((value, ctx) => {
    const r = checkSlug(value);
    if (!r.ok) {
      ctx.addIssue({
        code: "custom",
        message:
          r.reason === "reserved"
            ? "This name is reserved"
            : "Use 3-30 lowercase letters, digits or hyphens (no leading/trailing hyphen)",
      });
    }
  });
