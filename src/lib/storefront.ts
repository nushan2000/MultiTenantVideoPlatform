import { cookies, headers } from "next/headers";
import { cache } from "react";
import { AGE_COOKIE } from "./age-cookie";
import { parseFeatures } from "./theme";
import { HttpError } from "./ingest/types";
import { resolveHost, type ResolvedTenant } from "./tenancy/resolve";

/** Tenant for the current request, from the Host header (set/overwritten by middleware; never from client input). */
export async function requestTenant(): Promise<ResolvedTenant> {
  const h = await headers();
  const host = h.get("x-tenant-host");
  if (!host) throw new HttpError(404, "Not found");
  const t = await resolveHost(host);
  if (!t) throw new HttpError(404, "Not found");
  return t;
}

/** Per-render memo for server components. */
export const tenantForHost = cache((host: string) => resolveHost(decodeURIComponent(host)));

/**
 * True when the visitor must pass the age gate first. Pages call this themselves: the layout swaps in the interstitial,
 * but Next still renders the page and ships it in the RSC payload, so each page must refuse to load gated content.
 */
export async function ageGateBlocks(t: ResolvedTenant): Promise<boolean> {
  const gated = t.contentCategory === "ADULT" || parseFeatures(t.features).ageGate;
  return gated && !(await cookies()).get(AGE_COOKIE);
}
