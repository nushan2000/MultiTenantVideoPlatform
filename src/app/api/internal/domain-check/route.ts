import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { isDomainApproved } from "@/lib/domains";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

function tokenOk(given: string | null): boolean {
  const want = Buffer.from(getEnv().INTERNAL_TOKEN);
  const got = Buffer.from(given ?? "");
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

/**
 * Caddy `ask` endpoint:  on_demand_tls { ask http://127.0.0.1:3000/api/internal/domain-check?token=... }
 * Caddy appends `&domain=<host>`. 200 = issue a certificate, anything else = refuse.
 * Protected by a shared secret AND must be bound to loopback / firewalled from the internet (see ARCHITECTURE.md).
 * This path is also excluded from tenant hosts: middleware only lets platform hosts through to /api/internal.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!tokenOk(url.searchParams.get("token") ?? req.headers.get("x-internal-token"))) return new NextResponse("forbidden", { status: 403 });
  const domain = url.searchParams.get("domain");
  if (!domain) return new NextResponse("bad request", { status: 400 });
  const ok = await isDomainApproved(domain);
  return new NextResponse(ok ? "ok" : "not approved", { status: ok ? 200 : 404 });
}
