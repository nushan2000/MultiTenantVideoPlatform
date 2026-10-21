import type { PrismaClient } from "@prisma/client";

export type Scope = { kind: "tenant"; tenantId: string } | { kind: "platform" };

/** Models owned by a tenant, and the column that holds the owning tenant's id. */
export const TENANT_KEY: Record<string, "tenantId" | "id"> = {
  Tenant: "id",
  Membership: "tenantId",
  Subscription: "tenantId",
  CustomDomain: "tenantId",
  Category: "tenantId",
  Video: "tenantId",
  VideoRendition: "tenantId",
  AdConfig: "tenantId",
  StorageUsage: "tenantId",
  Report: "tenantId",
  AuditLog: "tenantId",
  Page: "tenantId",
  Comment: "tenantId",
  VideoLike: "tenantId",
  Playlist: "tenantId",
  PlaylistItem: "tenantId",
  VideoStatDaily: "tenantId",
  BandwidthUsage: "tenantId",
};

type AnyArgs = Record<string, any>;

/** Layer 1: force the tenant filter / tenantId into the query arguments. */
export function injectTenant(model: string, operation: string, args: AnyArgs | undefined, tenantId: string): AnyArgs {
  const key = TENANT_KEY[model];
  const a: AnyArgs = { ...(args ?? {}) };
  if (!key) return a;

  const withTenant = (obj: AnyArgs | undefined) => ({ ...(obj ?? {}), [key]: tenantId });

  switch (operation) {
    case "create":
      if (model === "Tenant") throw new Error("Tenants cannot be created from a tenant-scoped client");
      a.data = withTenant(a.data);
      break;
    case "createMany":
    case "createManyAndReturn":
      if (model === "Tenant") throw new Error("Tenants cannot be created from a tenant-scoped client");
      a.data = Array.isArray(a.data) ? a.data.map(withTenant) : withTenant(a.data);
      break;
    case "upsert":
      a.where = withTenant(a.where);
      a.create = withTenant(a.create);
      break;
    default:
      // find*, count, aggregate, groupBy, update, updateMany, delete, deleteMany
      a.where = withTenant(a.where);
  }
  return a;
}

/**
 * Prisma client extension that runs every model operation in a transaction whose first statement
 * sets the RLS context (`set_config(..., true)` == SET LOCAL). `$transaction([...])` pins both
 * statements to one connection, so the setting can't leak to other requests via the pool.
 */
export function createScopedClient(base: PrismaClient, scope: Scope) {
  const settings: [string, string][] =
    scope.kind === "tenant" ? [["app.tenant_id", scope.tenantId]] : [["app.bypass_rls", "on"]];

  return base.$extends({
    name: scope.kind === "tenant" ? `tenant-scope:${scope.tenantId}` : "platform-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const finalArgs = scope.kind === "tenant" ? injectTenant(model, operation, args as AnyArgs, scope.tenantId) : args;
          const setters = settings.map(([k, v]) => base.$executeRaw`SELECT set_config(${k}, ${v}, true)`);
          const results = await base.$transaction([...setters, query(finalArgs)] as any);
          return results[results.length - 1];
        },
      },
    },
  });
}
