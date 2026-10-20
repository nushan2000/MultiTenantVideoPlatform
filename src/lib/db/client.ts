import { PrismaClient, Prisma } from "@prisma/client";
import { createScopedClient } from "./scoped";

const globalForPrisma = globalThis as unknown as { prismaBase?: PrismaClient };

/**
 * Raw client. Connects as `app_user`, so RLS applies. With no tenant context set,
 * tenant tables return zero rows. Do not use directly in feature code: use
 * `tenantDb(tenantId)`, `tenantTx(tenantId, fn)` or `platformDb`.
 */
export const baseClient: PrismaClient = globalForPrisma.prismaBase ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prismaBase = baseClient;

/** Layer 1 + 2: every query is scoped to `tenantId` (injected) and runs with `app.tenant_id` set (RLS). */
export function tenantDb(tenantId: string) {
  if (!tenantId) throw new Error("tenantDb requires a tenantId");
  return createScopedClient(baseClient, { kind: "tenant", tenantId });
}

/**
 * Platform context: cross-tenant access for the code paths that legitimately need it
 * (host resolution, auth/membership lookups, super-admin, workers, Stripe webhooks).
 * Sets `app.bypass_rls`. Every use should be easy to grep and justify in review.
 */
export const platformDb = createScopedClient(baseClient, { kind: "platform" });

export type TenantDb = ReturnType<typeof tenantDb>;
export type PlatformDb = typeof platformDb;
export type Tx = Prisma.TransactionClient;

/**
 * Interactive transaction with the RLS tenant context set. Use for multi-statement work (quota math,
 * raw SQL). Inside, queries are protected by RLS (layer 2) but NOT auto-injected (layer 1): pass tenantId explicitly.
 */
export function tenantTx<T>(tenantId: string, fn: (tx: Tx) => Promise<T>, timeoutMs = 15_000): Promise<T> {
  if (!tenantId) throw new Error("tenantTx requires a tenantId");
  return baseClient.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx);
    },
    { timeout: timeoutMs },
  );
}
