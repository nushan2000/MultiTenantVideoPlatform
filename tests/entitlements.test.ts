import { describe, expect, it } from "vitest";
import { entitlements, maxImportBytes, PLAN_CONFIG } from "@/lib/entitlements";

const GB = 1024 ** 3;
const MB = 1024 ** 2;

describe("entitlements(free)", () => {
  const e = entitlements("free");
  it("matches the plan spec", () => {
    expect(e).toMatchObject({
      canUseCustomDomain: false,
      canControlAds: false,
      storageLimitBytes: 5 * GB,
      maxResolution: 720,
      maxUploadBytes: 500 * MB,
      maxVideos: 100,
      canUseUrlImport: true,
      maxConcurrentImports: 2,
      maxImportBatch: 5,
      canUseCustomCss: false,
      canRemoveBadge: false,
    });
    expect(maxImportBytes(e)).toBe(500 * MB);
  });
});

describe("entitlements(premium)", () => {
  const e = entitlements("premium");
  it("matches the plan spec", () => {
    expect(e).toMatchObject({
      canUseCustomDomain: true,
      canControlAds: true,
      storageLimitBytes: 200 * GB,
      maxResolution: 1080,
      maxUploadBytes: 5 * GB,
      maxVideos: Infinity,
      canUseUrlImport: true,
      maxConcurrentImports: 5,
      maxImportBatch: 10,
      canUseCustomCss: true,
      canRemoveBadge: true,
    });
    expect(maxImportBytes(e)).toBe(5 * GB);
  });
  it("exposes every required key", () => {
    for (const k of [
      "canUseCustomDomain", "canControlAds", "storageLimitBytes", "maxResolution", "maxUploadBytes", "maxVideos",
      "canUseUrlImport", "maxConcurrentImports", "maxImportBatch", "canUseCustomCss", "canRemoveBadge",
    ]) {
      for (const plan of Object.values(PLAN_CONFIG)) expect(plan).toHaveProperty(k);
    }
  });
});

it("unknown plan keys fall back to the most restrictive plan", () => {
  expect(entitlements("enterprise-typo")).toEqual(PLAN_CONFIG.free);
});
