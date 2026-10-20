// Pure host classification. No Node/Prisma imports: this runs in the Edge middleware.
import { RESERVED_SLUGS, checkSlug } from "./slugs";

export type HostClass =
  | { kind: "platform" } // marketing + dashboard
  | { kind: "subdomain"; slug: string } // {slug}.platform.com
  | { kind: "custom"; hostname: string } // anything else: needs a CustomDomain lookup
  | { kind: "invalid" }; // reserved / malformed platform subdomain -> 404

/** lower-case, strip port and trailing dot. */
export function normalizeHost(raw: string | null | undefined): string {
  if (!raw) return "";
  let h = raw.trim().toLowerCase();
  // IPv6 literal e.g. [::1]:3000
  if (h.startsWith("[")) return h.slice(0, h.indexOf("]") + 1);
  h = h.replace(/:\d+$/, "");
  return h.replace(/\.$/, "");
}

const PLATFORM_LABELS = new Set(["www", "app"]);

export function classifyHost(rawHost: string | null | undefined, rootDomain: string): HostClass {
  const host = normalizeHost(rawHost);
  const root = rootDomain.toLowerCase();
  if (!host) return { kind: "invalid" };
  if (host === root) return { kind: "platform" };
  // Loopback names are never tenants: internal calls (Caddy `ask`, health checks) use them.
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return { kind: "platform" };

  if (host.endsWith(`.${root}`)) {
    const label = host.slice(0, -(root.length + 1));
    if (PLATFORM_LABELS.has(label)) return { kind: "platform" };
    // Only single-label subdomains: a.b.platform.com is not a tenant.
    if (label.includes(".")) return { kind: "invalid" };
    if (RESERVED_SLUGS.has(label) || !checkSlug(label).ok) return { kind: "invalid" };
    return { kind: "subdomain", slug: label };
  }

  return { kind: "custom", hostname: host };
}
