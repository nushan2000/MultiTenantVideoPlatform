"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireTenant, requireUser, requestIp } from "@/lib/access";
import { checkAdInput } from "@/lib/ads";
import { audit } from "@/lib/audit";
import { applyPlanChange, billingProviderFor, BillingUnavailableError, devBillingEnabled } from "@/lib/billing";
import { platformDb } from "@/lib/db/client";
import { addCustomDomain, verifyDomain } from "@/lib/domains";
import { getEnv } from "@/lib/env";
import { HttpError } from "@/lib/ingest/types";
import { EntitlementError } from "@/lib/entitlements";
import { rateLimit, RateLimitError } from "@/lib/rate-limit";
import { storeBranding } from "@/lib/branding";
import { invalidateHosts, invalidateTenant } from "@/lib/tenancy/resolve";
import { slugSchema } from "@/lib/tenancy/slugs";
import { checkThemeContrast, featuresSchema, presetTheme, themeSchema, validateCustomCss, parseTheme, type Theme } from "@/lib/theme";
import { isTemplateId, DEFAULT_TEMPLATE } from "@/templates/registry";

/** Redirect back to a dashboard page with a flash message. Always throws (NEXT_REDIRECT). */
function flash(path: string, kind: "ok" | "error", msg: string): never {
  redirect(`${path}?${kind}=${encodeURIComponent(msg)}`);
}

/** Run an action body; convert known errors to flash messages. */
async function guarded<T>(path: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof HttpError || e instanceof EntitlementError || e instanceof BillingUnavailableError) return flash(path, "error", e.message);
    if (e instanceof RateLimitError) return flash(path, "error", "Too many requests. Please wait a moment.");
    if (e instanceof z.ZodError) return flash(path, "error", e.issues[0]?.message ?? "Invalid input");
    throw e; // includes NEXT_REDIRECT
  }
}

const checkbox = (f: FormData, name: string) => f.get(name) === "on";

// ---------------------------------------------------------------- create site (wizard)

function themeFromForm(f: FormData, ent: { canUseCustomTheme: boolean; canUseCustomCss: boolean }, previous?: Theme): Theme {
  const density = themeSchema.shape.density.parse(f.get("density") || "comfortable");
  let theme: Theme;
  if (ent.canUseCustomTheme) {
    theme = themeSchema.parse({
      primaryColor: f.get("primaryColor") || undefined,
      bgColor: f.get("bgColor") || undefined,
      textColor: f.get("textColor") || undefined,
      font: f.get("font") || undefined,
      radius: Number(f.get("radius") ?? 8),
      density,
      customCss: previous?.customCss ?? "",
    });
    const low = checkThemeContrast(theme);
    if (low) throw new HttpError(400, low);
  } else {
    // Free plan: curated presets only.
    theme = { ...presetTheme(String(f.get("preset") ?? "classic")), density, customCss: "" };
  }
  if (f.has("customCss")) {
    const css = String(f.get("customCss") ?? "");
    if (css.trim()) {
      if (!ent.canUseCustomCss) throw new EntitlementError("Custom CSS is a Premium feature.", "css_not_allowed");
      const v = validateCustomCss(css);
      if (!v.ok) throw new HttpError(400, v.reason);
    }
    theme.customCss = ent.canUseCustomCss ? css : "";
  }
  return theme;
}

export async function createSiteAction(formData: FormData) {
  const user = await requireUser();
  const ip = await requestIp();
  await guarded("/dashboard/new", async () => {
    await rateLimit(`create-site:user:${user.id}`, 5, 3600);
    const input = z
      .object({
        name: z.string().trim().min(2, "Site name must be at least 2 characters").max(60),
        slug: slugSchema,
        template: z.string().default(DEFAULT_TEMPLATE),
        contentCategory: z.enum(["GENERAL", "ADULT"]).default("GENERAL"),
      })
      .parse({ name: formData.get("name"), slug: formData.get("slug"), template: formData.get("template") || undefined, contentCategory: formData.get("contentCategory") || undefined });
    if (!isTemplateId(input.template)) throw new HttpError(400, "Unknown template");
    if (await platformDb.tenant.findUnique({ where: { slug: input.slug } })) throw new HttpError(409, "That address is already taken");

    const free = await platformDb.plan.upsert({ where: { key: "free" }, update: {}, create: { key: "free", name: "Free" } });
    const theme = themeFromForm(formData, { canUseCustomTheme: false, canUseCustomCss: false });
    const features = featuresSchema.parse({
      comments: checkbox(formData, "f_comments"), categories: checkbox(formData, "f_categories"), search: checkbox(formData, "f_search"),
      likes: checkbox(formData, "f_likes"), ageGate: checkbox(formData, "f_ageGate") || input.contentCategory === "ADULT", downloads: false,
    });

    const tenant = await platformDb.tenant.create({
      data: {
        slug: input.slug, name: input.name, planId: free.id, contentCategory: input.contentCategory, templateId: input.template,
        theme: theme as object, features: features as object, profile: { contactEmail: user.email } as object,
        memberships: { create: { userId: user.id, role: "OWNER" } },
        adConfig: { create: { mode: "PLATFORM" } },
        storageUsage: { create: {} },
      },
    });
    const logo = formData.get("logo");
    if (logo instanceof File && logo.size > 0) {
      await platformDb.tenant.update({ where: { id: tenant.id }, data: { logoUrl: await storeBranding(tenant.id, logo, "logo") } });
    }
    await audit({ action: "tenant.created", tenantId: tenant.id, userId: user.id, ip, metadata: { slug: input.slug, contentCategory: input.contentCategory } });
    await invalidateTenant(tenant.id);
    redirect(`/dashboard/${tenant.slug}?ok=${encodeURIComponent("Your site is live!")}`);
  });
}

// ---------------------------------------------------------------- settings

export async function saveGeneralAction(slug: string, formData: FormData) {
  const path = `/dashboard/${slug}/settings`;
  const a = await requireTenant(slug, ["OWNER", "ADMIN"]);
  await guarded(path, async () => {
    const input = z
      .object({ name: z.string().trim().min(2).max(60), template: z.string(), contentCategory: z.enum(["GENERAL", "ADULT"]) })
      .parse({ name: formData.get("name"), template: formData.get("template"), contentCategory: formData.get("contentCategory") });
    if (!isTemplateId(input.template)) throw new HttpError(400, "Unknown template");
    const features = featuresSchema.parse(a.tenant.features ?? {});
    if (input.contentCategory === "ADULT") features.ageGate = true; // mandatory interstitial
    if (input.contentCategory === "ADULT" && a.tenant.contentCategory !== "ADULT") {
      // Switching to adult: refuse if the tenant is using an ad network that disallows adult content.
      const cfg = await a.db.adConfig.findFirst();
      if (cfg?.mode === "CUSTOM") {
        const check = checkAdInput("ADULT", { vastTagUrl: cfg.vastTagUrl, htmlSnippet: cfg.htmlSnippet });
        if (!check.ok) throw new HttpError(400, `Update your ad settings first: ${check.error}`);
      }
    }
    await a.db.tenant.update({ where: { id: a.tenant.id }, data: { name: input.name, templateId: input.template, contentCategory: input.contentCategory, features: features as object } });
    if (input.contentCategory !== a.tenant.contentCategory) await audit({ action: "tenant.category_changed", tenantId: a.tenant.id, userId: a.userRow.id, metadata: { to: input.contentCategory } });
    await invalidateTenant(a.tenant.id);
  });
  revalidatePath(path);
  flash(path, "ok", "Saved");
}

export async function saveThemeAction(slug: string, formData: FormData) {
  const path = `/dashboard/${slug}/settings`;
  const a = await requireTenant(slug, ["OWNER", "ADMIN"]);
  await guarded(path, async () => {
    const theme = themeFromForm(formData, a.ent, parseTheme(a.tenant.theme));
    await a.db.tenant.update({ where: { id: a.tenant.id }, data: { theme: theme as object } });
    await invalidateTenant(a.tenant.id);
  });
  flash(path, "ok", "Theme saved");
}

export type CustomizeInput = {
  name: string;
  template: string;
  preset: string;
  primaryColor: string; bgColor: string; textColor: string;
  font: string; radius: number; density: string;
  search: boolean; categories: boolean;
  customCss?: string;
};

/** Saves everything the step-by-step customizer edits in one go. Same plan rules as the Settings forms; returns a result instead of redirecting so the customizer keeps its state. */
export async function saveCustomizationAction(slug: string, input: CustomizeInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await requireTenant(slug, ["OWNER", "ADMIN"]);
  try {
    const name = z.string().trim().min(2, "Site name is too short").max(60).parse(input.name);
    if (!isTemplateId(input.template)) throw new HttpError(400, "Unknown template");
    const f = new FormData();
    for (const k of ["preset", "primaryColor", "bgColor", "textColor", "font", "density"] as const) f.set(k, String(input[k]));
    f.set("radius", String(input.radius));
    if (input.customCss !== undefined) {
      f.set("customCss", input.customCss);
    }
    const theme = themeFromForm(f, a.ent, parseTheme(a.tenant.theme));
    const features = featuresSchema.parse({ ...featuresSchema.parse(a.tenant.features ?? {}), search: !!input.search, categories: !!input.categories });
    await a.db.tenant.update({ where: { id: a.tenant.id }, data: { name, templateId: input.template, theme: theme as object, features: features as object } });
    await invalidateTenant(a.tenant.id);
    revalidatePath(`/dashboard/${slug}`, "layout");
    return { ok: true };
  } catch (e) {
    if (e instanceof HttpError || e instanceof EntitlementError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid input" };
    throw e;
  }
}

export async function saveFeaturesAction(slug: string, formData: FormData) {
  const path = `/dashboard/${slug}/settings`;
  const a = await requireTenant(slug, ["OWNER", "ADMIN"]);
  await guarded(path, async () => {
    const adult = a.tenant.contentCategory === "ADULT";
    const features = featuresSchema.parse({
      comments: checkbox(formData, "comments"), categories: checkbox(formData, "categories"), search: checkbox(formData, "search"),
      likes: checkbox(formData, "likes"), ageGate: adult || checkbox(formData, "ageGate"), downloads: false, noindex: checkbox(formData, "noindex"), crawlerAccess: checkbox(formData, "crawlerAccess"),
    });
    await a.db.tenant.update({ where: { id: a.tenant.id }, data: { features: features as object } });
    await invalidateTenant(a.tenant.id);
  });
  flash(path, "ok", "Features saved");
}

export async function uploadLogoAction(slug: string, formData: FormData) {
  const path = `/dashboard/${slug}/settings`;
  const a = await requireTenant(slug, ["OWNER", "ADMIN"]);
  await guarded(path, async () => {
    const file = formData.get("logo");
    if (!(file instanceof File) || file.size === 0) throw new HttpError(400, "Choose an image first");
    const url = await storeBranding(a.tenant.id, file, "logo");
    await a.db.tenant.update({ where: { id: a.tenant.id }, data: { logoUrl: url } });
    await invalidateTenant(a.tenant.id);
  });
  flash(path, "ok", "Logo updated");
}

export async function addCategoryAction(slug: string, formData: FormData) {
  const path = `/dashboard/${slug}/settings`;
  const a = await requireTenant(slug, ["OWNER", "ADMIN", "EDITOR"]);
  await guarded(path, async () => {
    const name = z.string().trim().min(1).max(40).parse(formData.get("name"));
    const catSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
    if (!catSlug) throw new HttpError(400, "Use letters or numbers in the category name");
    if (await a.db.category.findFirst({ where: { slug: catSlug } })) throw new HttpError(409, "That category already exists");
    await a.db.category.create({ data: { name, slug: catSlug } as any });
  });
  flash(path, "ok", "Category added");
}

export async function deleteCategoryAction(slug: string, categoryId: string) {
  const a = await requireTenant(slug, ["OWNER", "ADMIN", "EDITOR"]);
  await a.db.category.deleteMany({ where: { id: categoryId } });
  flash(`/dashboard/${slug}/settings`, "ok", "Category deleted");
}

// ---------------------------------------------------------------- domains (premium)

export async function addDomainAction(slug: string, formData: FormData) {
  const path = `/dashboard/${slug}/domains`;
  const a = await requireTenant(slug, ["OWNER", "ADMIN"]);
  await guarded(path, async () => {
    await rateLimit(`domain-add:${a.tenant.id}`, 10, 3600);
    await addCustomDomain(a.tenant.id, a.planKey, a.userRow.id, String(formData.get("hostname") ?? ""), await requestIp());
    await invalidateTenant(a.tenant.id);
  });
  flash(path, "ok", "Domain added. Create the DNS records below, then click Verify.");
}

export async function verifyDomainAction(slug: string, domainId: string) {
  const path = `/dashboard/${slug}/domains`;
  const a = await requireTenant(slug, ["OWNER", "ADMIN"]);
  const owned = await a.db.customDomain.findFirst({ where: { id: domainId } });
  if (!owned) flash(path, "error", "Domain not found");
  const status = await verifyDomain(domainId);
  flash(path, status === "ACTIVE" || status === "VERIFIED" ? "ok" : "error", status === "ACTIVE" ? "Domain is live" : status === "VERIFIED" ? "DNS verified. The certificate is being issued." : "DNS records not found yet. Changes can take a while to propagate.");
}

export async function removeDomainAction(slug: string, domainId: string) {
  const a = await requireTenant(slug, ["OWNER", "ADMIN"]);
  const d = await a.db.customDomain.findFirst({ where: { id: domainId } });
  if (d) {
    await a.db.customDomain.deleteMany({ where: { id: domainId } });
    await invalidateHosts([d.hostname]);
    await audit({ action: "domain.removed", tenantId: a.tenant.id, userId: a.userRow.id, target: d.hostname });
  }
  flash(`/dashboard/${slug}/domains`, "ok", "Domain removed");
}

// ---------------------------------------------------------------- ads

export async function saveAdsAction(slug: string, formData: FormData) {
  const path = `/dashboard/${slug}/ads`;
  const a = await requireTenant(slug, ["OWNER", "ADMIN"]);
  await guarded(path, async () => {
    if (!a.ent.canControlAds) throw new EntitlementError("Controlling ads is a Premium feature. Free sites show platform ads.", "ads_not_allowed");
    const mode = z.enum(["PLATFORM", "CUSTOM"]).parse(formData.get("mode"));
    const enabled = checkbox(formData, "enabled");
    let vast: string | null = null;
    let html: string | null = null;
    if (mode === "CUSTOM") {
      const checked = checkAdInput(a.tenant.contentCategory, { vastTagUrl: String(formData.get("vastTagUrl") ?? ""), htmlSnippet: String(formData.get("htmlSnippet") ?? "") });
      if (!checked.ok) throw new HttpError(400, checked.error);
      vast = checked.vastTagUrl;
      html = checked.htmlSnippet;
    }
    const data = { mode, enabled: mode === "CUSTOM" ? enabled : true, vastTagUrl: vast, htmlSnippet: html };
    const existing = await a.db.adConfig.findFirst();
    if (existing) await a.db.adConfig.update({ where: { id: existing.id }, data });
    else await a.db.adConfig.create({ data: data as any });
    await audit({ action: "ads.updated", tenantId: a.tenant.id, userId: a.userRow.id, metadata: { mode, enabled: data.enabled } });
  });
  flash(path, "ok", "Ad settings saved");
}

// ---------------------------------------------------------------- billing

export async function startCheckoutAction(slug: string) {
  const path = `/dashboard/${slug}/billing`;
  const a = await requireTenant(slug, ["OWNER"]);
  let url: string;
  try {
    const app = getEnv().APP_URL;
    ({ url } = await billingProviderFor(a.tenant.contentCategory).createCheckout({
      tenantId: a.tenant.id, tenantSlug: slug, email: a.userRow.email,
      successUrl: `${app}${path}?ok=${encodeURIComponent("Thanks! Your plan will update in a moment.")}`, cancelUrl: `${app}${path}`,
    }));
  } catch (e) {
    if (e instanceof BillingUnavailableError) return flash(path, "error", e.message);
    throw e;
  }
  redirect(url);
}

/** Development only (no Stripe keys configured): flip plans locally to exercise entitlements & downgrade rules. */
export async function devSetPlanAction(slug: string, planKey: "free" | "premium") {
  const a = await requireTenant(slug, ["OWNER"]);
  if (!devBillingEnabled()) flash(`/dashboard/${slug}/billing`, "error", "Not available");
  await applyPlanChange(a.tenant.id, planKey, { actor: a.userRow.id });
  flash(`/dashboard/${slug}/billing`, "ok", `Plan set to ${planKey} (dev)`);
}

// ---------------------------------------------------------------- abuse reports inbox

export async function resolveReportAction(slug: string, reportId: string, action: "dismiss" | "takedown") {
  const path = `/dashboard/${slug}/reports`;
  const a = await requireTenant(slug, ["OWNER", "ADMIN"]);
  const report = await a.db.report.findFirst({ where: { id: reportId } });
  if (!report) flash(path, "error", "Report not found");
  if (action === "takedown") {
    await a.db.video.updateMany({ where: { id: report!.videoId }, data: { status: "BLOCKED", failureReason: "Removed after a report" } });
    await a.db.report.updateMany({ where: { id: reportId }, data: { status: "ACTIONED" } });
  } else {
    await a.db.report.updateMany({ where: { id: reportId }, data: { status: "DISMISSED" } });
  }
  await audit({ action: `report.${action}`, tenantId: a.tenant.id, userId: a.userRow.id, target: reportId, metadata: { videoId: report!.videoId } });
  flash(path, "ok", action === "takedown" ? "Video taken down" : "Report dismissed");
}
