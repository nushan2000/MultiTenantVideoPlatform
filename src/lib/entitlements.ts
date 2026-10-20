// The ONLY place plan rules live. UI and API code ask `entitlements(planKey)`; never `planKey === "premium"`.
const GB = 1024 ** 3;
const MB = 1024 ** 2;

export type PlanKey = "free" | "premium";

export type Entitlements = {
  canUseCustomDomain: boolean;
  canControlAds: boolean;
  storageLimitBytes: number;
  maxResolution: 720 | 1080;
  maxUploadBytes: number;
  maxVideos: number; // Infinity = unlimited
  canUseUrlImport: boolean;
  maxConcurrentImports: number;
  maxImportBatch: number;
  maxImportFileBytes: number;
  canUseCustomCss: boolean;
  canUseCustomTheme: boolean;
  canRemoveBadge: boolean;
  canUseAnalytics: boolean;
  maxDurationSec: number;
};

// Restricting URL import to premium later = flip `canUseUrlImport` on the free row.
export const PLAN_CONFIG: Record<PlanKey, Entitlements> = {
  free: {
    canUseCustomDomain: false,
    canControlAds: false,
    storageLimitBytes: 5 * GB,
    maxResolution: 720,
    maxUploadBytes: 500 * MB,
    maxVideos: 100,
    canUseUrlImport: true,
    maxConcurrentImports: 2,
    maxImportBatch: 5,
    maxImportFileBytes: 500 * MB,
    canUseCustomCss: false,
    canUseCustomTheme: false,
    canRemoveBadge: false,
    canUseAnalytics: false,
    maxDurationSec: 2 * 3600,
  },
  premium: {
    canUseCustomDomain: true,
    canControlAds: true,
    storageLimitBytes: 200 * GB,
    maxResolution: 1080,
    maxUploadBytes: 5 * GB,
    maxVideos: Infinity,
    canUseUrlImport: true,
    maxConcurrentImports: 5,
    maxImportBatch: 10,
    maxImportFileBytes: 5 * GB,
    canUseCustomCss: true,
    canUseCustomTheme: true,
    canRemoveBadge: true,
    canUseAnalytics: true,
    maxDurationSec: 8 * 3600,
  },
};

export function entitlements(planKey: string): Entitlements {
  return PLAN_CONFIG[(planKey in PLAN_CONFIG ? planKey : "free") as PlanKey];
}

/** Per-file cap for a URL import: the stricter of the import cap and the general upload cap. */
export function maxImportBytes(e: Entitlements): number {
  return Math.min(e.maxImportFileBytes, e.maxUploadBytes);
}

export class EntitlementError extends Error {
  constructor(
    message: string,
    public readonly code: string = "entitlement",
  ) {
    super(message);
  }
}
