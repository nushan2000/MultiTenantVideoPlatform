import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { platformDb, tenantDb } from "@/lib/db/client";
import { entitlements } from "@/lib/entitlements";
import { HttpError } from "@/lib/ingest/types";
import { clientIp } from "@/lib/rate-limit";
import { getEnv } from "@/lib/env";
import type { Role } from "@prisma/client";

export type SessionUser = { id: string; email: string; name: string | null; isSuperAdmin: boolean };

/** Current user from the session cookie (re-read from DB so revoked/admin flags are always fresh). */
export async function getUser(): Promise<SessionUser | null> {
  const session = await auth();
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!id) return null;
  const u = await platformDb.user.findUnique({ where: { id }, select: { id: true, email: true, name: true, isSuperAdmin: true } });
  return u;
}

export async function requireUser(): Promise<SessionUser> {
  const u = await getUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireSuperAdmin(): Promise<SessionUser> {
  const u = await requireUser();
  if (!u.isSuperAdmin) redirect("/dashboard");
  return u;
}

export async function requestIp(): Promise<string> {
  return clientIp(await headers());
}

/** Membership + tenant + plan entitlements. `by` is the tenant slug (pages) or id (APIs). */
export async function loadTenantAccess(userId: string, by: { slug?: string; id?: string }, roles?: Role[]) {
  const m = await platformDb.membership.findFirst({
    where: { userId, tenant: by.slug ? { slug: by.slug } : { id: by.id } },
    include: { tenant: { include: { plan: true } } },
  });
  if (!m) return null;
  if (roles && !roles.includes(m.role)) return null;
  const { tenant } = m;
  return {
    user: userId,
    role: m.role,
    tenant,
    planKey: tenant.plan.key,
    ent: entitlements(tenant.plan.key),
    db: tenantDb(tenant.id), // layer 1 + RLS scoped to this tenant
  };
}
export type TenantAccess = NonNullable<Awaited<ReturnType<typeof loadTenantAccess>>>;

/** For server components / actions: redirects away if the user has no access. */
export async function requireTenant(slug: string, roles?: Role[]): Promise<TenantAccess & { userRow: SessionUser }> {
  const user = await requireUser();
  const access = await loadTenantAccess(user.id, { slug }, roles);
  if (!access) redirect("/dashboard");
  if (access.tenant.status === "SUSPENDED") redirect("/dashboard?suspended=1");
  return { ...access, userRow: user };
}

/** For route handlers: throws HttpError instead of redirecting. */
export async function apiTenant(tenantId: string, roles?: Role[]): Promise<TenantAccess & { userRow: SessionUser; ip: string }> {
  const user = await getUser();
  if (!user) throw new HttpError(401, "Please sign in", "unauthenticated");
  const access = await loadTenantAccess(user.id, { id: tenantId }, roles);
  if (!access) throw new HttpError(404, "Site not found", "not_found"); // 404, not 403: don't confirm other tenants exist
  if (access.tenant.status === "SUSPENDED") throw new HttpError(403, "This site is suspended", "suspended");
  return { ...access, userRow: user, ip: await requestIp() };
}

/** CSRF defence for cookie-authenticated JSON endpoints: mutating requests must come from our own origin. */
export function assertSameOrigin(req: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  let ok = false;
  if (origin && host) {
    try {
      ok = new URL(origin).host === host;
    } catch {}
  }
  if (!ok && !origin && req.headers.get("sec-fetch-site") === "same-origin") ok = true;
  if (!ok) throw new HttpError(403, "Cross-site request blocked", "csrf");
}

export const platformHosts = () => {
  const root = getEnv().PLATFORM_ROOT_DOMAIN;
  return [root, `www.${root}`, `app.${root}`];
};
