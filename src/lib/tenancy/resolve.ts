import { platformDb } from "@/lib/db/client";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";
import { classifyHost, normalizeHost } from "./host";

export type ResolvedTenant = {
  id: string;
  slug: string;
  name: string;
  planKey: string;
  contentCategory: "GENERAL" | "ADULT";
  templateId: string;
  theme: unknown;
  features: unknown;
  seo: unknown;
  logoUrl: string | null;
  faviconUrl: string | null;
};

const TTL_SECONDS = 60;
const NEGATIVE_TTL_SECONDS = 5; // short, so a brand-new site doesn't 404 for a minute
const key = (host: string) => `tenant-host:${host}`;

async function lookup(host: string): Promise<ResolvedTenant | null> {
  const cls = classifyHost(host, getEnv().PLATFORM_ROOT_DOMAIN);
  if (cls.kind === "platform" || cls.kind === "invalid") return null;

  const select = {
    id: true, slug: true, name: true, contentCategory: true, templateId: true,
    theme: true, features: true, seo: true, logoUrl: true, faviconUrl: true,
    plan: { select: { key: true } },
  } as const;

  const tenant =
    cls.kind === "subdomain"
      ? await platformDb.tenant.findFirst({ where: { slug: cls.slug, status: "ACTIVE" }, select })
      : (
          await platformDb.customDomain.findFirst({
            where: { hostname: cls.hostname, status: { in: ["VERIFIED", "ACTIVE"] }, tenant: { status: "ACTIVE" } },
            select: { tenant: { select } },
          })
        )?.tenant ?? null;

  if (!tenant) return null;
  const { plan, ...rest } = tenant;
  return { ...rest, planKey: plan.key };
}

/** Host -> tenant, cached in Redis for 60s. Redis failure degrades to a DB lookup. */
export async function resolveHost(rawHost: string | null | undefined): Promise<ResolvedTenant | null> {
  const host = normalizeHost(rawHost);
  if (!host) return null;

  try {
    const hit = await (await redis()).get(key(host));
    if (hit !== null) return hit === "null" ? null : (JSON.parse(hit) as ResolvedTenant);
  } catch (err) {
    logger.warn({ err: String(err) }, "tenant cache read failed");
  }

  const tenant = await lookup(host);
  try {
    await (await redis()).set(key(host), JSON.stringify(tenant), "EX", tenant ? TTL_SECONDS : NEGATIVE_TTL_SECONDS);
  } catch (err) {
    logger.warn({ err: String(err) }, "tenant cache write failed");
  }
  return tenant;
}

/** Call whenever a tenant's slug/status/theme/plan or a custom domain changes. */
export async function invalidateHosts(hosts: string[]): Promise<void> {
  if (hosts.length === 0) return;
  try {
    await (await redis()).del(...hosts.map((h) => key(normalizeHost(h))));
  } catch (err) {
    logger.warn({ err: String(err) }, "tenant cache invalidation failed");
  }
}

/** Convenience: invalidate the subdomain host plus any custom domains for a tenant. */
export async function invalidateTenant(tenantId: string): Promise<void> {
  const root = getEnv().PLATFORM_ROOT_DOMAIN;
  const t = await platformDb.tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true, domains: { select: { hostname: true } } },
  });
  if (!t) return;
  await invalidateHosts([`${t.slug}.${root}`, ...t.domains.map((d) => d.hostname)]);
}
