import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { baseClient, platformDb, tenantDb } from "@/lib/db/client";

// Integration test: needs the docker-compose postgres, connected as the non-superuser `app_user`.
const run = Date.now().toString(36);
let tenantA: string, tenantB: string, videoA: string, videoB: string;

beforeAll(async () => {
  const [{ rolsuper, rolbypassrls }] = await baseClient.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
    SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
  if (rolsuper || rolbypassrls) {
    throw new Error("DATABASE_URL must use a role without SUPERUSER/BYPASSRLS, otherwise RLS is not tested");
  }

  const plan = await platformDb.plan.upsert({ where: { key: "free" }, update: {}, create: { key: "free", name: "Free" } });
  const mk = (slug: string) => platformDb.tenant.create({ data: { slug: `${slug}-${run}`, name: slug, planId: plan.id } });
  tenantA = (await mk("iso-a")).id;
  tenantB = (await mk("iso-b")).id;

  const video = (tenantId: string, title: string) =>
    platformDb.video.create({ data: { tenantId, title, ingestMethod: "DIRECT", visibility: "PUBLIC" } });
  videoA = (await video(tenantA, "A secret")).id;
  videoB = (await video(tenantB, "B secret")).id;
});

afterAll(async () => {
  await platformDb.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } }); // cascades
  await baseClient.$disconnect();
});

describe("layer 1: Prisma tenant wrapper", () => {
  it("tenant A only sees its own videos", async () => {
    const videos = await tenantDb(tenantA).video.findMany();
    expect(videos.map((v) => v.id)).toEqual([videoA]);
  });

  it("tenant A cannot read tenant B's video by id", async () => {
    expect(await tenantDb(tenantA).video.findUnique({ where: { id: videoB } })).toBeNull();
    expect(await tenantDb(tenantA).video.findFirst({ where: { id: videoB } })).toBeNull();
  });

  it("tenant A cannot update or delete tenant B's video", async () => {
    const db = tenantDb(tenantA);
    expect((await db.video.updateMany({ where: { id: videoB }, data: { title: "pwned" } })).count).toBe(0);
    expect((await db.video.deleteMany({ where: { id: videoB } })).count).toBe(0);
    expect((await platformDb.video.findUnique({ where: { id: videoB } }))?.title).toBe("B secret");
  });

  it("create always stamps the caller's tenantId, even if another is supplied", async () => {
    const v = await tenantDb(tenantA).video.create({
      data: { tenantId: tenantB, title: "spoof", ingestMethod: "DIRECT" } as any,
    });
    expect(v.tenantId).toBe(tenantA);
  });

  it("a tenant client only sees its own Tenant row", async () => {
    const rows = await tenantDb(tenantA).tenant.findMany();
    expect(rows.map((t) => t.id)).toEqual([tenantA]);
  });

  it("platform context sees both tenants", async () => {
    const rows = await platformDb.video.findMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
    expect(new Set(rows.map((v) => v.tenantId))).toEqual(new Set([tenantA, tenantB]));
  });
});

describe("layer 2: Postgres RLS (bypassing the wrapper entirely)", () => {
  const withTenant = <T>(id: string, fn: (tx: typeof baseClient) => Promise<T>) =>
    baseClient.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${id}, true)`;
      return fn(tx as unknown as typeof baseClient);
    });

  it("with no tenant context, tenant tables return zero rows (fail closed)", async () => {
    expect(await baseClient.video.findMany()).toHaveLength(0);
    expect(await baseClient.tenant.findMany()).toHaveLength(0);
  });

  it("with tenant A context, an unfiltered query returns only A's rows", async () => {
    const rows = await withTenant(tenantA, (tx) => tx.$queryRaw<{ tenantId: string }[]>`SELECT "tenantId" FROM "Video"`);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.tenantId === tenantA)).toBe(true);
  });

  it("with tenant A context, B's row is invisible even when asked for by id", async () => {
    const rows = await withTenant(tenantA, (tx) => tx.$queryRaw`SELECT id FROM "Video" WHERE id = ${videoB}`);
    expect(rows).toHaveLength(0);
  });

  it("with tenant A context, inserting a row for tenant B is rejected", async () => {
    await expect(
      withTenant(tenantA, (tx) =>
        tx.$executeRaw`INSERT INTO "Video" (id, "tenantId", title, "ingestMethod", "updatedAt") VALUES (${"x" + run}, ${tenantB}, 't', 'DIRECT', now())`,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("with tenant A context, moving A's row to tenant B is rejected", async () => {
    await expect(
      withTenant(tenantA, (tx) => tx.$executeRaw`UPDATE "Video" SET "tenantId" = ${tenantB} WHERE id = ${videoA}`),
    ).rejects.toThrow(/row-level security/i);
  });

  it("the tenant setting does not leak to the next query on the pool", async () => {
    await tenantDb(tenantA).video.findMany();
    expect(await baseClient.video.findMany()).toHaveLength(0);
  });
});
