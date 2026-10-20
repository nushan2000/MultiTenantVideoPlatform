import { NextResponse, type NextRequest } from "next/server";
import { classifyHost } from "@/lib/tenancy/host";

/**
 * Edge middleware: pure host classification only (no DB/Redis here; Edge can't run Prisma/ioredis).
 *  - platform host  -> pass through (marketing + dashboard + admin)
 *  - tenant host    -> rewrite to /sites/{host}/...; the page resolves host -> tenant (Redis-cached)
 *  - invalid host   -> 404
 * The host is the *only* tenant input; it comes from the Host header, never from the client path.
 */

// Storefront CSP. Tenant HTML is sanitised server-side (no scripts), so scripts are limited to our own bundle.
// Next injects inline bootstrap scripts, hence 'unsafe-inline' (nonce-based CSP is a follow-up; see ARCHITECTURE.md).
const storefrontCsp = (dev: boolean, embed = false) =>
  [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "connect-src 'self' https: " + (dev ? "http: ws:" : ""),
    "frame-src https:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // the embeddable player is meant to be framed (video sitemap player_loc); everything else must not be
    `frame-ancestors ${embed ? "*" : "'none'"}`,
  ].join("; ");

// The only API routes reachable through a tenant host.
const TENANT_API_ALLOW = ["/api/media/", "/api/public/"];

function secure(res: NextResponse, tenant: boolean, embed = false) {
  res.headers.set("x-content-type-options", "nosniff");
  res.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  if (tenant) res.headers.set("content-security-policy", storefrontCsp(process.env.NODE_ENV !== "production", embed));
  else res.headers.set("x-frame-options", "DENY");
  return res;
}

export function middleware(req: NextRequest) {
  const rootDomain = process.env.PLATFORM_ROOT_DOMAIN ?? "localhost";
  const host = req.headers.get("host");
  const cls = classifyHost(host, rootDomain);
  const { pathname } = req.nextUrl;

  // /sites/* is an internal route; it must not be reachable by typing the URL.
  if (pathname.startsWith("/sites/")) return new NextResponse("Not found", { status: 404 });

  const headers = new Headers(req.headers);
  headers.delete("x-tenant-host"); // never trust a client-supplied value

  if (cls.kind === "invalid") return new NextResponse("Not found", { status: 404 });
  if (cls.kind === "platform") return secure(NextResponse.next({ request: { headers } }), false);

  // Tenant host (subdomain or custom domain).
  const normalized = host!.toLowerCase().replace(/:\d+$/, "");
  headers.set("x-tenant-host", normalized);

  if (pathname.startsWith("/api/")) {
    if (!TENANT_API_ALLOW.some((p) => pathname.startsWith(p))) return new NextResponse("Not found", { status: 404 });
    return secure(NextResponse.next({ request: { headers } }), true);
  }
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/admin") || pathname === "/login" || pathname === "/register") {
    return new NextResponse("Not found", { status: 404 }); // dashboard lives on the platform domain only
  }

  const url = req.nextUrl.clone();
  url.pathname = `/sites/${encodeURIComponent(normalized)}${pathname === "/" ? "" : pathname}`;
  return secure(NextResponse.rewrite(url, { request: { headers } }), true, pathname.startsWith("/embed/"));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
