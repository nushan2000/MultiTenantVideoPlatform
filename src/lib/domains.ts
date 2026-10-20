import dns from "node:dns/promises";
import crypto from "node:crypto";
import net from "node:net";
import { audit } from "./audit";
import { platformDb } from "./db/client";
import { cnameTarget, getEnv } from "./env";
import { EntitlementError, entitlements } from "./entitlements";
import { HttpError } from "./ingest/types";
import { invalidateHosts } from "./tenancy/resolve";
import { logger } from "./logger";

export const VERIFY_LABEL = "_platform-verify";

const HOSTNAME_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function normalizeHostname(input: string): string {
  return input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
}

/** Throws HttpError for anything that isn't a plain, third-party, public DNS name. */
export function validateCustomHostname(raw: string, rootDomain = getEnv().PLATFORM_ROOT_DOMAIN): string {
  const host = normalizeHostname(raw);
  if (host.includes(":") || host.includes("*") || net.isIP(host) || !HOSTNAME_RE.test(host)) {
    throw new HttpError(400, "Enter a domain like videos.example.com", "invalid_domain");
  }
  const root = rootDomain.toLowerCase();
  if (host === root || host.endsWith(`.${root}`) || root.endsWith(`.${host}`)) {
    throw new HttpError(400, "This domain belongs to the platform", "reserved_domain");
  }
  if (host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new HttpError(400, "Enter a public domain name", "invalid_domain");
  }
  return host;
}

export const dnsInstructions = (hostname: string, token: string) => ({
  cname: { type: "CNAME", name: hostname, value: cnameTarget() },
  txt: { type: "TXT", name: `${VERIFY_LABEL}.${hostname}`, value: token },
});

export async function addCustomDomain(tenantId: string, planKey: string, userId: string, rawHostname: string, ip?: string) {
  if (!entitlements(planKey).canUseCustomDomain) throw new EntitlementError("Custom domains are a Premium feature.", "domain_not_allowed");
  const hostname = validateCustomHostname(rawHostname);
  const claimed = await platformDb.customDomain.findUnique({ where: { hostname } });
  if (claimed) throw new HttpError(409, "This domain is already in use", "domain_claimed");
  const domain = await platformDb.customDomain.create({
    data: { tenantId, hostname, status: "PENDING", verificationToken: `pv-${crypto.randomBytes(16).toString("hex")}`, tlsStatus: "none" },
  });
  await audit({ action: "domain.added", tenantId, userId, target: hostname, ip });
  return domain;
}

const strip = (s: string) => s.toLowerCase().replace(/\.$/, "");

export type DnsCheck = { txtOk: boolean; routeOk: boolean };

export async function checkDns(hostname: string, token: string): Promise<DnsCheck> {
  let txtOk = false;
  let routeOk = false;
  try {
    const txt = (await dns.resolveTxt(`${VERIFY_LABEL}.${hostname}`)).flat();
    txtOk = txt.some((t) => t.trim() === token);
  } catch {}
  try {
    routeOk = (await dns.resolveCname(hostname)).some((c) => strip(c) === strip(cnameTarget()));
  } catch {}
  if (!routeOk && process.env.PLATFORM_IPS) {
    // apex domains can't use CNAME: accept A/AAAA records that point at this server
    const ours = new Set(process.env.PLATFORM_IPS.split(",").map((s) => s.trim()));
    try {
      const addrs = [...(await dns.resolve4(hostname).catch(() => [])), ...(await dns.resolve6(hostname).catch(() => []))];
      routeOk = addrs.some((a) => ours.has(a));
    } catch {}
  }
  return { txtOk, routeOk };
}

/** First HTTPS hit also triggers Caddy's on-demand certificate issuance; a valid response means TLS works. */
async function probeTls(hostname: string): Promise<boolean> {
  try {
    const res = await fetch(`https://${hostname}/api/health`, { signal: AbortSignal.timeout(20_000), redirect: "manual" });
    return res.status > 0;
  } catch {
    return false;
  }
}

/**
 * PENDING -> VERIFIED (DNS correct) -> ACTIVE (HTTPS serving). Safe to call repeatedly.
 * Domains of tenants that are no longer entitled stay PENDING (deactivated).
 */
export async function verifyDomain(domainId: string, opts: { probe?: boolean } = {}): Promise<string> {
  const d = await platformDb.customDomain.findUnique({ where: { id: domainId }, include: { tenant: { include: { plan: true } } } });
  if (!d) return "missing";
  if (!entitlements(d.tenant.plan.key).canUseCustomDomain) return d.status;

  const { txtOk, routeOk } = await checkDns(d.hostname, d.verificationToken);
  let status = d.status;
  let tls = d.tlsStatus;
  if (txtOk && routeOk) {
    if (status === "PENDING" || status === "FAILED") status = "VERIFIED";
    if (status === "VERIFIED" && (opts.probe ?? true) && (await probeTls(d.hostname))) {
      status = "ACTIVE";
      tls = "issued";
    } else if (status === "VERIFIED") tls = "pending";
  } else if (status !== "PENDING") {
    status = "PENDING"; // DNS was removed/changed: deactivate
    tls = "none";
  }
  const stale = Date.now() - d.createdAt.getTime() > 72 * 3600_000;
  if (status === "PENDING" && stale && !(txtOk && routeOk)) status = "FAILED";

  if (status !== d.status || tls !== d.tlsStatus) {
    await platformDb.customDomain.update({ where: { id: d.id }, data: { status, tlsStatus: tls } });
    await invalidateHosts([d.hostname]);
    await audit({ action: "domain.status", tenantId: d.tenantId, target: d.hostname, metadata: { from: d.status, to: status } });
    logger.info({ hostname: d.hostname, from: d.status, to: status }, "custom domain status changed");
  }
  return status;
}

/**
 * Caddy on-demand TLS `ask` target: approve certificates ONLY for verified custom domains of entitled, active
 * tenants (and existing tenant subdomains if you terminate per-subdomain certs instead of using a wildcard).
 */
export async function isDomainApproved(hostname: string): Promise<boolean> {
  const host = normalizeHostname(hostname);
  if (!host) return false;
  const root = getEnv().PLATFORM_ROOT_DOMAIN;
  if (host === root || host === `app.${root}` || host === `www.${root}` || host === cnameTarget()) return true;
  if (host.endsWith(`.${root}`)) {
    const slug = host.slice(0, -(root.length + 1));
    if (slug.includes(".")) return false;
    return !!(await platformDb.tenant.findFirst({ where: { slug, status: "ACTIVE" }, select: { id: true } }));
  }
  const d = await platformDb.customDomain.findFirst({
    where: { hostname: host, status: { in: ["VERIFIED", "ACTIVE"] }, tenant: { status: "ACTIVE" } },
    include: { tenant: { include: { plan: true } } },
  });
  return !!d && entitlements(d.tenant.plan.key).canUseCustomDomain;
}
