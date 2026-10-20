// Seed: 1 free tenant, 1 premium tenant, sample videos (real HLS via the real pipeline), a super admin.
// Needs `pnpm infra` running and migrations applied. Idempotent-ish: re-running skips existing slugs.
import "dotenv/config";
import bcrypt from "bcryptjs";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { baseClient, platformDb } from "@/lib/db/client";
import { PLAN_CONFIG } from "@/lib/entitlements";
import { reserveQuota } from "@/lib/quota";
import { keys, putObject } from "@/lib/storage";
import { siteUrl } from "@/lib/site-url";
import { ffmpegPath, processVideo } from "@/lib/transcode";
import { presetTheme } from "@/lib/theme";

const PASSWORD = "password1234";

async function main() {
  const free = await platformDb.plan.upsert({ where: { key: "free" }, update: {}, create: { key: "free", name: "Free" } });
  const premium = await platformDb.plan.upsert({ where: { key: "premium" }, update: {}, create: { key: "premium", name: "Premium" } });
  const hash = await bcrypt.hash(PASSWORD, 12);

  const user = (email: string, name: string, isSuperAdmin = false) =>
    platformDb.user.upsert({ where: { email }, update: {}, create: { email, name, passwordHash: hash, isSuperAdmin, termsAcceptedAt: new Date() } });
  const admin = await user("admin@example.com", "Platform Admin", true);
  const freeOwner = await user("free@example.com", "Free Owner");
  const premiumOwner = await user("premium@example.com", "Premium Owner");

  const mkTenant = async (slug: string, name: string, planId: string, owner: { id: string }, theme: object, extra: object = {}) => {
    const existing = await platformDb.tenant.findUnique({ where: { slug } });
    if (existing) return existing;
    return platformDb.tenant.create({
      data: {
        slug, name, planId, theme, features: { categories: true, search: true }, profile: { contactEmail: `hello@${slug}.example`, legalName: name }, ...extra,
        memberships: { create: { userId: owner.id, role: "OWNER" } },
        adConfig: { create: { mode: "PLATFORM" } },
        storageUsage: { create: {} },
      },
    });
  };
  const freeT = await mkTenant("demo-free", "Demo Free Site", free.id, freeOwner, presetTheme("classic"));
  const premT = await mkTenant("demo-premium", "Demo Premium Site", premium.id, premiumOwner, { ...presetTheme("midnight"), radius: 14, customCss: "" });
  void admin;

  const tmp = mkdtempSync(path.join(os.tmpdir(), "seed-"));
  try {
    const samples: [string, string, string][] = [["Test pattern", "testsrc", "440"], ["Color bars", "smptebars", "660"], ["Mandelbrot", "mandelbrot", "880"]];
    for (const tenant of [freeT, premT]) {
      const have = await platformDb.video.count({ where: { tenantId: tenant.id } });
      if (have > 0) continue;
      const cat = await platformDb.category.create({ data: { tenantId: tenant.id, name: "Samples", slug: "samples" } });
      const limit = tenant.id === premT.id ? PLAN_CONFIG.premium.storageLimitBytes : PLAN_CONFIG.free.storageLimitBytes;
      for (const [i, [title, src, hz]] of samples.entries()) {
        const file = path.join(tmp, `${tenant.slug}-${i}.mp4`);
        execFileSync(ffmpegPath(), ["-y", "-f", "lavfi", "-i", `${src}=size=1280x720:rate=24`, "-f", "lavfi", "-i", `sine=frequency=${hz}`, "-t", "6", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", file], { stdio: "ignore" });
        const buf = readFileSync(file);
        const video = await platformDb.video.create({
          data: { tenantId: tenant.id, title, description: `Sample video ${i + 1}`, status: "PROCESSING", ingestMethod: "DIRECT", visibility: "PUBLIC", featured: i === 0, categoryId: cat.id, sizeBytes: BigInt(buf.length),
            tags: ["samples", i === 0 ? "demo" : "test"], chapters: [{ start: 0, title: "Start" }, { start: 3, title: "Middle" }], transcript: `Sample transcript for ${title}.` },
        });
        await reserveQuota(tenant.id, buf.length, limit);
        await putObject(keys.source(tenant.id, video.id, "mp4"), buf, "video/mp4");
        await processVideo(tenant.id, video.id);
        console.log(`  ${tenant.slug}: ${title} ready`);
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  console.log(`\nSeeded. All accounts use password "${PASSWORD}":`);
  console.log(`  free@example.com     -> ${siteUrl("demo-free")}`);
  console.log(`  premium@example.com  -> ${siteUrl("demo-premium")}`);
  console.log(`  admin@example.com    -> /admin (super admin)`);
}

main().then(() => baseClient.$disconnect(), async (e) => { console.error(e); await baseClient.$disconnect(); process.exit(1); });
