import dns from "node:dns/promises";
import Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { checkAdInput, resolveAds, sanitizeAdHtml } from "@/lib/ads";
import { applyPlanChange, billingProviderFor, BillingUnavailableError, StripeBillingProvider } from "@/lib/billing";
import { baseClient, platformDb } from "@/lib/db/client";
import { addCustomDomain, isDomainApproved, validateCustomHostname, verifyDomain } from "@/lib/domains";
import { resolveHost } from "@/lib/tenancy/resolve";
import { validateCustomCss } from "@/lib/theme";

vi.mock("node:dns/promises", async (orig) => {
  const real = await orig<typeof import("node:dns/promises")>();
  const fake = { ...real, resolveTxt: vi.fn(), resolveCname: vi.fn(), resolve4: vi.fn(), resolve6: vi.fn() };
  return { ...fake, default: fake };
});

const run = Date.now().toString(36);
const ROOT = process.env.PLATFORM_ROOT_DOMAIN!;
let tenantId: string, slug: string, userId: string;

beforeAll(async () => {
  const free = await platformDb.plan.upsert({ where: { key: "free" }, update: {}, create: { key: "free", name: "Free" } });
  await platformDb.plan.upsert({ where: { key: "premium" }, update: {}, create: { key: "premium", name: "Premium" } });
  slug = `plat-${run}`;
  tenantId = (await platformDb.tenant.create({ data: { slug, name: "Plat", planId: free.id, adConfig: { create: {} }, storageUsage: { create: {} } } })).id;
  userId = (await platformDb.user.create({ data: { email: `plat-${run}@example.com`, passwordHash: "x", termsAcceptedAt: new Date() } })).id;
});
afterAll(async () => {
  await platformDb.tenant.deleteMany({ where: { slug: { endsWith: `-${run}` } } });
  await platformDb.user.deleteMany({ where: { id: userId } });
  await baseClient.$disconnect();
});

describe("custom hostname validation", () => {
  it("accepts normal third-party domains", () => {
    expect(validateCustomHostname("Videos.Example.com")).toBe("videos.example.com");
    expect(validateCustomHostname("https://videos.example.com/path")).toBe("videos.example.com");
  });
  it.each(["localhost", "192.168.1.1", "*.example.com", "exa mple.com", "example", "a.b", "x.localhost", "example.com:8080", ""])("rejects %s", (h) => {
    expect(() => validateCustomHostname(h, "platform.test")).toThrow();
  });
  it("blocks platform-owned names", () => {
    expect(() => validateCustomHostname("platform.test", "platform.test")).toThrow(/platform/);
    expect(() => validateCustomHostname("acme.platform.test", "platform.test")).toThrow(/platform/);
  });
});

describe("custom domain lifecycle + plan downgrade", () => {
  const host = `videos-${run}.example.org`;
  const mockDns = (ok: boolean, token: string) => {
    (dns.resolveTxt as any).mockImplementation(async () => (ok ? [[token]] : Promise.reject(new Error("ENODATA"))));
    (dns.resolveCname as any).mockImplementation(async () => (ok ? [`cname.${ROOT}.`] : Promise.reject(new Error("ENODATA"))));
    (dns.resolve4 as any).mockRejectedValue(new Error("none"));
    (dns.resolve6 as any).mockRejectedValue(new Error("none"));
  };

  it("free plan cannot add a domain", async () => {
    await expect(addCustomDomain(tenantId, "free", userId, host)).rejects.toMatchObject({ code: "domain_not_allowed" });
  });

  it("premium: add -> PENDING; not approved for TLS; DNS verified -> VERIFIED; approved; resolves to the tenant", async () => {
    await applyPlanChange(tenantId, "premium");
    const d = await addCustomDomain(tenantId, "premium", userId, host);
    expect(d.status).toBe("PENDING");
    expect(d.verificationToken).toMatch(/^pv-/);
    await expect(addCustomDomain(tenantId, "premium", userId, host)).rejects.toMatchObject({ code: "domain_claimed" });
    expect(await isDomainApproved(host)).toBe(false); // Caddy `ask`: no certificate for unverified domains
    expect(await resolveHost(host)).toBeNull();

    mockDns(false, d.verificationToken);
    expect(await verifyDomain(d.id, { probe: false })).toBe("PENDING"); // DNS missing

    mockDns(true, d.verificationToken);
    expect(await verifyDomain(d.id, { probe: false })).toBe("VERIFIED");
    expect(await isDomainApproved(host)).toBe(true);
    expect((await resolveHost(host))?.slug).toBe(slug);
  });

  it("rejects wrong TXT token", async () => {
    const d = (await platformDb.customDomain.findUnique({ where: { hostname: host } }))!;
    await platformDb.customDomain.update({ where: { id: d.id }, data: { status: "PENDING" } });
    mockDns(true, "pv-wrong");
    expect(await verifyDomain(d.id, { probe: false })).toBe("PENDING");
  });

  it("downgrade: domain deactivated (falls back to subdomain), content kept, TLS no longer approved", async () => {
    const d = (await platformDb.customDomain.findUnique({ where: { hostname: host } }))!;
    mockDns(true, d.verificationToken);
    await verifyDomain(d.id, { probe: false });
    expect((await resolveHost(host))?.slug).toBe(slug); // cached now

    await applyPlanChange(tenantId, "free");
    const after = await platformDb.customDomain.findUnique({ where: { hostname: host } });
    expect(after).not.toBeNull(); // row kept
    expect(after!.status).toBe("PENDING"); // deactivated
    expect(await isDomainApproved(host)).toBe(false);
    expect(await resolveHost(host)).toBeNull(); // cache was invalidated on the plan change
    expect((await resolveHost(`${slug}.${ROOT}`))?.slug).toBe(slug); // subdomain still works
  });

  it("verification refuses to re-activate a domain for a non-entitled tenant", async () => {
    const d = (await platformDb.customDomain.findUnique({ where: { hostname: host } }))!;
    mockDns(true, d.verificationToken);
    expect(await verifyDomain(d.id, { probe: false })).toBe("PENDING");
  });

  it("suspended tenants stop resolving after cache invalidation", async () => {
    const { invalidateTenant } = await import("@/lib/tenancy/resolve");
    expect(await resolveHost(`${slug}.${ROOT}`)).not.toBeNull();
    await platformDb.tenant.update({ where: { id: tenantId }, data: { status: "SUSPENDED" } });
    await invalidateTenant(tenantId);
    expect(await resolveHost(`${slug}.${ROOT}`)).toBeNull();
    await platformDb.tenant.update({ where: { id: tenantId }, data: { status: "ACTIVE" } });
    await invalidateTenant(tenantId);
  });
});

describe("ads", () => {
  it("sanitises tenant HTML: no scripts, handlers or javascript: URLs; iframes are sandboxed", () => {
    const out = sanitizeAdHtml(
      `<script>alert(1)</script><img src="https://x.test/a.png" onerror="alert(1)"><a href="javascript:alert(1)">x</a><a href="https://ok.test">ok</a><iframe src="https://ads.test/f"></iframe>`,
    );
    expect(out).not.toMatch(/<script|onerror|javascript:/i);
    expect(out).toContain('href="https://ok.test"');
    expect(out).toMatch(/<iframe[^>]*sandbox=/);
  });
  it("requires https VAST tags", () => {
    expect(checkAdInput("GENERAL", { vastTagUrl: "http://ads.test/v.xml" })).toMatchObject({ ok: false });
    expect(checkAdInput("GENERAL", { vastTagUrl: "https://ads.test/v.xml" })).toMatchObject({ ok: true });
  });
  it("blocks ad networks that disallow adult content on adult sites only", () => {
    expect(checkAdInput("ADULT", { vastTagUrl: "https://pubads.g.doubleclick.net/gampad/ads" })).toMatchObject({ ok: false });
    expect(checkAdInput("ADULT", { htmlSnippet: '<a href="https://www.facebook.com/x">ad</a>' })).toMatchObject({ ok: false });
    expect(checkAdInput("GENERAL", { vastTagUrl: "https://pubads.g.doubleclick.net/gampad/ads" })).toMatchObject({ ok: true });
    expect(checkAdInput("ADULT", { vastTagUrl: "https://adult-friendly.test/vast" })).toMatchObject({ ok: true });
  });
  it("Free: always platform ads, whatever AdConfig says. Premium: tenant config / off.", async () => {
    await platformDb.adConfig.update({ where: { tenantId }, data: { mode: "CUSTOM", enabled: false, vastTagUrl: "https://mine.test/v.xml" } });
    const t = { id: tenantId, planKey: "free", contentCategory: "GENERAL" };
    const freeAds = await resolveAds(t);
    expect(freeAds.source).not.toBe("tenant"); // cannot be disabled or replaced
    expect(freeAds.vastTagUrl).not.toBe("https://mine.test/v.xml");

    expect(await resolveAds({ ...t, planKey: "premium" })).toMatchObject({ source: "none" }); // premium may turn ads off
    await platformDb.adConfig.update({ where: { tenantId }, data: { enabled: true } });
    expect(await resolveAds({ ...t, planKey: "premium" })).toMatchObject({ source: "tenant", vastTagUrl: "https://mine.test/v.xml" });
    await platformDb.adConfig.update({ where: { tenantId }, data: { mode: "PLATFORM" } });
    expect((await resolveAds({ ...t, planKey: "premium" })).source).not.toBe("tenant");
  });
});

describe("custom CSS validation", () => {
  it("allows ordinary CSS", () => {
    expect(validateCustomCss(".sf-card{border:1px solid red;background:url(https://cdn.test/a.png)}")).toEqual({ ok: true });
  });
  it.each([
    "@import url(https://evil.test/x.css);", "</style><script>alert(1)</script>", "a{background:url(javascript:alert(1))}",
    "a{width:expression(alert(1))}", "a{background:url(http://insecure.test/a.png)}", "@font-face{font-family:x;src:url(https://x.test/f.woff)}",
    "a{-moz-binding:url(x)}",
  ])("rejects %s", (css) => expect(validateCustomCss(css).ok).toBe(false));
  it("rejects oversized CSS", () => expect(validateCustomCss("a{}".repeat(8000)).ok).toBe(false));
});

describe("billing", () => {
  const secret = "whsec_test_secret";
  const provider = new StripeBillingProvider("sk_test_dummy", secret, "price_dummy");
  const sign = (payload: string) => Stripe.webhooks.generateTestHeaderString({ payload, secret });
  const event = (type: string, object: object) => JSON.stringify({ id: "evt_1", object: "event", type, data: { object } });

  it("verifies signatures and maps checkout.session.completed -> subscription_active", async () => {
    const body = event("checkout.session.completed", { id: "cs_1", object: "checkout.session", client_reference_id: "tenant_1", payment_status: "paid", customer: "cus_1", subscription: "sub_1" });
    expect(await provider.parseWebhook(body, sign(body))).toEqual({ type: "subscription_active", tenantId: "tenant_1", customerId: "cus_1", subscriptionId: "sub_1" });
  });
  it("maps subscription deletion / lapse -> subscription_ended", async () => {
    const del = event("customer.subscription.deleted", { id: "sub_1", object: "subscription", status: "canceled", metadata: { tenantId: "tenant_1" } });
    expect(await provider.parseWebhook(del, sign(del))).toMatchObject({ type: "subscription_ended", tenantId: "tenant_1" });
    const past = event("customer.subscription.updated", { id: "sub_1", object: "subscription", status: "past_due", metadata: { tenantId: "tenant_1" } });
    expect(await provider.parseWebhook(past, sign(past))).toMatchObject({ type: "subscription_ended" });
    const ok = event("customer.subscription.updated", { id: "sub_1", object: "subscription", status: "active", metadata: { tenantId: "tenant_1" } });
    expect(await provider.parseWebhook(ok, sign(ok))).toMatchObject({ type: "subscription_active" });
  });
  it("rejects bad or missing signatures", async () => {
    const body = event("checkout.session.completed", { id: "cs_1", object: "checkout.session", client_reference_id: "t", payment_status: "paid" });
    await expect(provider.parseWebhook(body, "t=1,v1=deadbeef")).rejects.toThrow();
    await expect(provider.parseWebhook(body, null)).rejects.toThrow();
  });
  it("ignores unrelated events", async () => {
    const body = event("invoice.created", { id: "in_1", object: "invoice" });
    expect(await provider.parseWebhook(body, sign(body))).toBeNull();
  });
  it("adult-content tenants have no processor until a high-risk one is registered", () => {
    expect(() => billingProviderFor("ADULT")).toThrow(BillingUnavailableError);
  });
});
