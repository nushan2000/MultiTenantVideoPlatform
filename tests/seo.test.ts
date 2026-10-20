import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { baseClient, platformDb, tenantDb } from "@/lib/db/client";
import { findCategoryByRef, findVideoByRef, videoHandleTaken, videoPath, withHandleHistory } from "@/lib/handles";
import {
  analyzeDescription, analyzeTitle, applyTitleTemplate, handleSchema, parsePageSeo, parseSiteSeo, pageSeoInputSchema, pageSeoSchema,
  seoHealth, siteSeoSchema, slugifyHandle, stripText, truncate,
} from "@/lib/seo";
import { isoDuration } from "@/lib/seo-server";

describe("sanitisation", () => {
  it("strips tags and control characters, collapses whitespace", () => {
    expect(stripText("  <b>Hello</b>\n\n  <script>alert(1)</script>world\u0000 ")).toBe("Hello alert(1)world");
  });
  it("page SEO text fields are cleaned and length-limited", () => {
    const r = pageSeoSchema.parse({ title: "<i>My</i> title", description: "a  b" });
    expect(r.title).toBe("My title");
    expect(r.description).toBe("a b");
    expect(() => pageSeoSchema.parse({ title: "x".repeat(71) })).toThrow();
  });
  it("empty strings mean 'no override'", () => {
    const r = pageSeoSchema.parse({ title: "", description: "  ", ogImage: "", handle: "" });
    expect(r.title).toBeUndefined();
    expect(r.handle).toBeUndefined();
  });
});

describe("images and URLs are restricted", () => {
  it("accepts https and our own media paths only", () => {
    expect(pageSeoSchema.safeParse({ ogImage: "https://cdn.test/a.png" }).success).toBe(true);
    expect(pageSeoSchema.safeParse({ ogImage: "/api/media/tenants/t/branding/og.png" }).success).toBe(true);
    for (const bad of ["http://x.test/a.png", "javascript:alert(1)", "data:text/html,<script>", "//evil.test/a.png", "ftp://x/a"]) {
      expect(pageSeoSchema.safeParse({ ogImage: bad }).success, bad).toBe(false);
    }
  });
  it("canonical URL must be https", () => {
    expect(pageSeoSchema.safeParse({ canonicalUrl: "http://x.test" }).success).toBe(false);
    expect(pageSeoSchema.safeParse({ canonicalUrl: "https://x.test/p" }).success).toBe(true);
  });
  it("social profiles must be https", () => {
    expect(siteSeoSchema.safeParse({ socials: ["https://x.com/me", "javascript:1"] }).success).toBe(false);
    expect(siteSeoSchema.parse({ socials: ["https://x.com/me", ""] }).socials).toEqual(["https://x.com/me"]);
  });
});

describe("site-wide settings", () => {
  it("title template must contain %s", () => {
    expect(siteSeoSchema.safeParse({ titleTemplate: "My site" }).success).toBe(false);
    expect(siteSeoSchema.safeParse({ titleTemplate: "%s | My site" }).success).toBe(true);
    expect(applyTitleTemplate("%s | Acme", "Cats", "Acme")).toBe("Cats | Acme");
    expect(applyTitleTemplate(undefined, "Cats", "Acme")).toBe("Cats · Acme");
  });
  it("keywords: comma list or array, trimmed, unique, max 15", () => {
    expect(siteSeoSchema.parse({ keywords: " a, b ,a,, c " }).keywords).toEqual(["a", "b", "c"]);
    expect(siteSeoSchema.parse({ keywords: Array.from({ length: 30 }, (_, i) => `k${i}`) }).keywords).toHaveLength(15);
  });
  it("validates handles, locale and verification codes", () => {
    expect(siteSeoSchema.safeParse({ twitterHandle: "@my_channel" }).success).toBe(true);
    expect(siteSeoSchema.safeParse({ twitterHandle: "not a handle!" }).success).toBe(false);
    expect(siteSeoSchema.safeParse({ locale: "en_US" }).success).toBe(true);
    expect(siteSeoSchema.safeParse({ locale: "english" }).success).toBe(false);
    expect(siteSeoSchema.safeParse({ googleVerification: "<meta name=x>" }).success).toBe(false);
  });
  it("tolerant readers never throw on legacy or garbage JSON", () => {
    expect(parseSiteSeo(null).keywords).toEqual([]);
    expect(parseSiteSeo({ keywords: 5, socials: "x" }).keywords).toEqual([]);
    expect(parsePageSeo("nope").noindex).toBe(false);
    expect(parsePageSeo({ title: "x".repeat(500) }).title).toBeUndefined();
  });
});

describe("URL handles", () => {
  it("normalises and validates", () => {
    expect(handleSchema.parse("  My-Video-2 ")).toBe("my-video-2");
    for (const bad of ["has space", "double--hyphen", "-lead", "trail-", "under_score", "ünï", "", "x".repeat(81)]) {
      expect(handleSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
  it("reserves id-shaped handles so a handle can never shadow another video's id", () => {
    expect(handleSchema.safeParse("cmvghhtsh0003a84oxqpw6cjl").success).toBe(false);
  });
  it("slugifies titles", () => {
    expect(slugifyHandle("Café: Best 10 Tips & Tricks!")).toBe("cafe-best-10-tips-tricks");
    expect(slugifyHandle("  ---  ")).toBe("");
  });
  it("client input cannot set server-managed redirect history", () => {
    const r = pageSeoInputSchema.parse({ handle: "new", previousHandles: ["steal-this"] } as any);
    expect((r as any).previousHandles).toBeUndefined();
  });
  it("history: remembers the retired handle, forgets it when reclaimed", () => {
    const prev = parsePageSeo({ handle: "a", previousHandles: ["old"] });
    expect(withHandleHistory(prev, "b", "a").sort()).toEqual(["a", "old"]);
    expect(withHandleHistory(parsePageSeo({ handle: "b", previousHandles: ["a", "old"] }), "a", "b").sort()).toEqual(["b", "old"]);
    expect(withHandleHistory(parsePageSeo({}), "first", undefined)).toEqual([]);
  });
});

describe("coaching", () => {
  it("flags empty / short / long / ideal titles and descriptions", () => {
    expect(analyzeTitle("").level).toBe("bad");
    expect(analyzeTitle("Hi").level).toBe("warn");
    expect(analyzeTitle("A perfectly sized title for search results").level).toBe("good");
    expect(analyzeTitle("x".repeat(80)).level).toBe("warn");
    expect(analyzeDescription("").level).toBe("bad");
    expect(analyzeDescription("x".repeat(100)).level).toBe("good");
    expect(analyzeDescription("x".repeat(250)).level).toBe("warn");
  });
  it("truncates on word boundaries with an ellipsis", () => {
    expect(truncate("one two three four", 12)).toBe("one two…");
    expect(truncate("short", 12)).toBe("short");
  });
  it("health score rewards a complete setup and punishes noindex", () => {
    const base = {
      seo: parseSiteSeo({ homeTitle: "A perfectly sized home title for the site", homeDescription: "x".repeat(120), ogImage: "https://x.test/o.png", googleVerification: "abcdefghij123", socials: ["https://x.com/me"], keywords: "a" }),
      siteName: "Site", hasLogo: true, hasFavicon: true, hasActiveCustomDomain: true, noindex: false,
      videos: { total: 10, withDescription: 10, withThumbnail: 10, customSeo: 5 }, categories: { total: 2, withSeo: 2 },
    };
    const good = seoHealth(base).score;
    expect(good).toBeGreaterThanOrEqual(90);
    expect(seoHealth({ ...base, noindex: true }).score).toBeLessThan(good - 15);
    const poor = seoHealth({ ...base, seo: parseSiteSeo({}), hasLogo: false, hasFavicon: false, hasActiveCustomDomain: false, videos: { total: 10, withDescription: 0, withThumbnail: 5, customSeo: 0 }, categories: { total: 2, withSeo: 0 } });
    expect(poor.score).toBeLessThan(40);
    expect(poor.items.every((i) => i.message.length > 0)).toBe(true);
  });
});

describe("structured data helpers", () => {
  it("ISO-8601 durations", () => {
    expect(isoDuration(59)).toBe("PT59S");
    expect(isoDuration(60)).toBe("PT1M");
    expect(isoDuration(3725)).toBe("PT1H2M5S");
    expect(isoDuration(0)).toBe("PT0S");
  });
});

// ---- handle lookup + redirects against the real database (RLS-scoped client)
const run = Date.now().toString(36);
let tenantA: string, tenantB: string, vA: string, vB: string, vOther: string;

describe("handle resolution (integration)", () => {
  beforeAll(async () => {
    const plan = await platformDb.plan.upsert({ where: { key: "free" }, update: {}, create: { key: "free", name: "Free" } });
    tenantA = (await platformDb.tenant.create({ data: { slug: `seoa-${run}`, name: "A", planId: plan.id } })).id;
    tenantB = (await platformDb.tenant.create({ data: { slug: `seob-${run}`, name: "B", planId: plan.id } })).id;
    const mk = (t: string, title: string, seo: object = {}) =>
      platformDb.video.create({ data: { tenantId: t, title, ingestMethod: "DIRECT", status: "READY", visibility: "PUBLIC", seo } });
    vA = (await mk(tenantA, "A1", { handle: "first-video", previousHandles: ["old-name"] })).id;
    vOther = (await mk(tenantA, "A2")).id;
    vB = (await mk(tenantB, "B1", { handle: "first-video" })).id; // same handle, other tenant: allowed
    await platformDb.category.create({ data: { tenantId: tenantA, name: "Cats", slug: "cats", seo: { previousHandles: ["felines"] } } });
  });
  afterAll(async () => {
    await platformDb.tenant.deleteMany({ where: { slug: { endsWith: `-${run}` } } });
    await baseClient.$disconnect();
  });

  it("resolves by current handle without redirect", async () => {
    const r = await findVideoByRef<any>(tenantDb(tenantA), "first-video");
    expect(r?.video.id).toBe(vA);
    expect(r?.redirect).toBe(false);
  });
  it("raw id redirects (308) to the handle URL; a video without a handle does not", async () => {
    expect((await findVideoByRef<any>(tenantDb(tenantA), vA))?.redirect).toBe(true);
    expect((await findVideoByRef<any>(tenantDb(tenantA), vOther))?.redirect).toBe(false);
  });
  it("retired handles still resolve and redirect", async () => {
    const r = await findVideoByRef<any>(tenantDb(tenantA), "old-name");
    expect(r?.video.id).toBe(vA);
    expect(r?.redirect).toBe(true);
  });
  it("handles are per-tenant: A cannot resolve B's video, and the same handle in B is B's", async () => {
    expect((await findVideoByRef<any>(tenantDb(tenantA), "first-video"))?.video.id).toBe(vA);
    expect((await findVideoByRef<any>(tenantDb(tenantB), "first-video"))?.video.id).toBe(vB);
    expect(await findVideoByRef(tenantDb(tenantA), vB)).toBeNull();
  });
  it("uniqueness check covers current and retired handles, ignoring the video itself", async () => {
    const db = tenantDb(tenantA);
    expect(await videoHandleTaken(db, "first-video", vOther)).toBe(true);
    expect(await videoHandleTaken(db, "old-name", vOther)).toBe(true);
    expect(await videoHandleTaken(db, "first-video", vA)).toBe(false);
    expect(await videoHandleTaken(db, "free-handle", vOther)).toBe(false);
  });
  it("categories resolve by slug and by retired slug", async () => {
    expect((await findCategoryByRef<any>(tenantDb(tenantA), "cats"))?.redirect).toBe(false);
    expect((await findCategoryByRef<any>(tenantDb(tenantA), "felines"))?.redirect).toBe(true);
    expect(await findCategoryByRef(tenantDb(tenantB), "cats")).toBeNull();
  });
  it("canonical path prefers the handle", () => {
    expect(videoPath({ id: "abc", seo: { handle: "nice" } })).toBe("/v/nice");
    expect(videoPath({ id: "abc", seo: {} })).toBe("/v/abc");
  });
});
