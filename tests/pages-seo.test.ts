import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isVerifiedCrawler } from "@/lib/crawler";
import { parseCsv, toCsv } from "@/lib/csv";
import { baseClient, platformDb, tenantDb } from "@/lib/db/client";
import {
  formatChapters, humanizeFilename, looksLikeCaptions, parseCaptionsJson, parseChapters, parseChaptersJson, parseTags, tagLabel, tagSlug, toVtt, vttToText,
} from "@/lib/media-meta";
import { renderMarkdown } from "@/lib/pages/markdown";
import { pageInputSchema, pageSlugCheck } from "@/lib/pages/input";
import { parseProfile, profileSchema } from "@/lib/pages/profile";
import { loadPages, footerGroups } from "@/lib/pages/store";
import { RESERVED_PAGE_SLUGS, SYSTEM_PAGES, systemPagesFor } from "@/lib/pages/system";
import { PAGE_SIZE, pageHref, parsePage, totalPagesOf } from "@/lib/pagination";
import { pageSeoSchema, parseJsonLd, siteSeoSchema, validateJsonLd } from "@/lib/seo";
import { buildIndex, buildMain, buildVideos } from "@/lib/sitemap";
import { checkThemeContrast, contrastRatio, THEME_PRESETS, presetTheme } from "@/lib/theme";

describe("Markdown pages are sanitised", () => {
  it("removes scripts, handlers, iframes and javascript: links", () => {
    const html = renderMarkdown(`## Hi\n\n<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">\n\n[click](javascript:alert(1))\n\n<iframe src="https://evil.test"></iframe>\n\n<div onclick="x()">d</div>`);
    expect(html).not.toMatch(/<script|onerror|onclick|javascript:|<iframe/i);
  });
  it("only allows https images and https/mailto/relative links; external links are nofollow", () => {
    const html = renderMarkdown(`![a](http://insecure.test/a.png) ![b](https://ok.test/b.png)\n\n[ext](https://example.com) [rel](/privacy) [mail](mailto:a@b.co)`);
    expect(html).not.toContain("http://insecure.test");
    expect(html).toContain("https://ok.test/b.png");
    expect(html).toMatch(/href="https:\/\/example\.com"[^>]*rel="noopener noreferrer nofollow ugc"/);
    expect(html).toContain('href="/privacy"');
    expect(html).toContain("mailto:a@b.co");
  });
  it("demotes # headings to h2 (the page title is the only h1)", () => {
    expect(renderMarkdown("# Big")).toContain("<h2");
    expect(renderMarkdown("# Big")).not.toContain("<h1");
  });
  it("renders tables and lists", () => {
    const html = renderMarkdown("| a | b |\n|---|---|\n| 1 | 2 |\n\n- x\n- y");
    expect(html).toContain("<table");
    expect(html).toContain("<li>x</li>");
  });
});

describe("system pages (the sections a video site needs)", () => {
  it("every standard section exists; legal basics are mandatory", () => {
    const keys = SYSTEM_PAGES.map((p) => p.key);
    for (const k of ["about", "contact", "faq", "privacy", "terms", "dmca", "cookies", "community"]) expect(keys).toContain(k);
    for (const k of ["privacy", "terms", "dmca", "cookies", "contact"]) expect(SYSTEM_PAGES.find((p) => p.key === k)!.mandatory).toBe(true);
    expect(SYSTEM_PAGES.find((p) => p.key === "about")!.mandatory).toBe(false);
  });
  it("2257 and parental controls only exist for adult sites", () => {
    expect(systemPagesFor(false).map((p) => p.key)).not.toContain("2257");
    expect(systemPagesFor(true).map((p) => p.key)).toEqual(expect.arrayContaining(["2257", "parental"]));
  });
  it("generated text uses the site's details and degrades gracefully when empty", () => {
    const profile = parseProfile({ legalName: "Acme Media Ltd", contactEmail: "hi@acme.test", country: "Canada" });
    const ctx = { siteName: "Acme TV", siteUrl: "https://acme.test", profile, adult: false };
    const privacy = SYSTEM_PAGES.find((p) => p.key === "privacy")!.body(ctx);
    expect(privacy).toContain("Acme Media Ltd");
    expect(privacy).toContain("hi@acme.test");
    expect(SYSTEM_PAGES.find((p) => p.key === "terms")!.body(ctx)).toContain("Canada");
    const bare = { siteName: "Bare", siteUrl: "https://bare.test", profile: parseProfile({}), adult: false };
    for (const p of SYSTEM_PAGES.filter((x) => !x.adultOnly)) {
      const body = p.body(bare);
      expect(body.length, p.key).toBeGreaterThan(100);
      expect(body, p.key).not.toMatch(/undefined|\[object|null/);
    }
    expect(SYSTEM_PAGES.find((p) => p.key === "dmca")!.body(bare)).toContain("**Report**"); // falls back to the report form
  });
  it("custom pages cannot take reserved or system slugs", () => {
    for (const s of ["privacy", "about", "v", "c", "search", "api", "dashboard", "sitemap", "trending", "tag", "embed"]) {
      expect(pageSlugCheck(s), s).not.toBeNull();
      expect(RESERVED_PAGE_SLUGS.has(s)).toBe(true);
    }
    expect(pageSlugCheck("our-story")).toBeNull();
    expect(pageSlugCheck("Bad Slug")).not.toBeNull();
  });
  it("page input is validated", () => {
    expect(pageInputSchema.safeParse({ title: "" }).success).toBe(false);
    const ok = pageInputSchema.parse({ title: "<b>Our</b> story", content: "x" });
    expect(ok.title).toBe("Our story");
    expect(ok.published).toBe(true);
  });
  it("business profile validates emails and strips markup", () => {
    expect(profileSchema.safeParse({ contactEmail: "nope" }).success).toBe(false);
    expect(profileSchema.parse({ legalName: "<i>Acme</i>" }).legalName).toBe("Acme");
    expect(parseProfile("garbage")).toEqual({});
  });
});

describe("tags, chapters, captions, titles", () => {
  it("tags are slugified, unique and capped", () => {
    expect(parseTags("Home Workout, yoga, YOGA, , Café!")).toEqual(["home-workout", "yoga", "cafe"]);
    expect(parseTags(Array.from({ length: 30 }, (_, i) => `t${i}`))).toHaveLength(15);
    expect(tagLabel("home-workout")).toBe("home workout");
    expect(tagSlug("Hello World")).toBe("hello-world");
  });
  it("chapters parse from lines, sort, dedupe and respect the duration", () => {
    const ch = parseChapters("12:05 Cool down\n0:00 Intro\n1:30 Warm up\n1:30 dup\nrubbish\n1:02:03 Beyond", 3600);
    expect(ch).toEqual([{ start: 0, title: "Intro" }, { start: 90, title: "Warm up" }, { start: 725, title: "Cool down" }]);
    expect(formatChapters(ch)).toBe("0:00 Intro\n1:30 Warm up\n12:05 Cool down");
    expect(parseChaptersJson([{ start: 5, title: "<b>x</b>" }, { nope: 1 }])).toEqual([{ start: 5, title: "x" }]);
  });
  it("SRT converts to WebVTT and the transcript text is extracted", () => {
    const srt = "1\n00:00:01,000 --> 00:00:03,000\nHello <i>world</i>\n\n2\n00:00:03,500 --> 00:00:05,000\nSecond line\n";
    expect(looksLikeCaptions(srt)).toBe(true);
    expect(looksLikeCaptions("just text")).toBe(false);
    const vtt = toVtt(srt);
    expect(vtt.startsWith("WEBVTT")).toBe(true);
    expect(vtt).toContain("00:00:01.000 --> 00:00:03.000");
    expect(vttToText(srt)).toBe("Hello world Second line");
    expect(toVtt(vtt)).toBe(vtt);
    expect(parseCaptionsJson([{ lang: "en", label: "English", path: "p" }, { lang: "bad lang!", label: "x", path: "p" }])).toHaveLength(1);
  });
  it("filenames become readable titles", () => {
    expect(humanizeFilename("my_clip-final_v2.MP4")).toBe("My Clip Final V2");
    expect(humanizeFilename("1234.mp4")).toBe("Untitled video");
    expect(humanizeFilename("")).toBe("Untitled video");
  });
});

describe("custom meta tags and structured data", () => {
  it("meta tags: allowed names only", () => {
    expect(pageSeoSchema.parse({ extraMeta: [{ name: "author", content: "Jane" }] }).extraMeta).toEqual([{ name: "author", content: "Jane" }]);
    for (const name of ["robots", "viewport", "description", "refresh", "http-equiv", "bad name", "<x>"]) {
      expect(pageSeoSchema.safeParse({ extraMeta: [{ name, content: "x" }] }).success, name).toBe(false);
    }
    expect(siteSeoSchema.safeParse({ extraMeta: Array.from({ length: 11 }, (_, i) => ({ name: `m${i}x`, content: "x" })) }).success).toBe(false);
  });
  it("JSON-LD: valid schema.org JSON only", () => {
    expect(validateJsonLd('{"@context":"https://schema.org","@type":"Person","name":"J"}')).toBeNull();
    expect(validateJsonLd("not json")).toMatch(/JSON/);
    expect(validateJsonLd('{"@type":"Person"}')).toMatch(/@context/);
    expect(validateJsonLd('{"@context":"https://schema.org"}')).toMatch(/@type/);
    expect(validateJsonLd("x".repeat(6000))).toMatch(/long/);
    expect(pageSeoSchema.safeParse({ jsonLd: "{bad" }).success).toBe(false);
    expect(parseJsonLd('[{"@context":"https://schema.org","@type":"A"}]')).toHaveLength(1);
    expect(parseJsonLd("garbage")).toEqual([]);
  });
});

describe("csv + pagination", () => {
  it("round-trips quotes, commas and newlines", () => {
    const rows = [["a", 'he said "hi", ok'], ["multi\nline", "x"]];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
  it("neutralises spreadsheet formula injection on export", () => {
    expect(toCsv([["=HYPERLINK(1)", "+1", "-2", "@x"]])).toBe("'=HYPERLINK(1),'+1,'-2,'@x\r\n");
  });
  it("page params are bounded", () => {
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("abc")).toBe(1);
    expect(parsePage("3")).toBe(3);
    expect(parsePage("999999")).toBe(500);
    expect(pageHref("/c/x", 1)).toBe("/c/x");
    expect(pageHref("/c/x", 2)).toBe("/c/x?page=2");
    expect(totalPagesOf(0)).toBe(1);
    expect(totalPagesOf(PAGE_SIZE + 1)).toBe(2);
  });
});

describe("accessibility: colour contrast", () => {
  it("computes WCAG ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 1);
  });
  it("every built-in preset is readable", () => {
    for (const key of Object.keys(THEME_PRESETS)) expect(checkThemeContrast(presetTheme(key)), key).toBeNull();
  });
  it("rejects unreadable custom palettes", () => {
    expect(checkThemeContrast({ primaryColor: "#2563eb", bgColor: "#ffffff", textColor: "#eeeeee" })).toMatch(/too similar/);
    expect(checkThemeContrast({ primaryColor: "#fefefe", bgColor: "#ffffff", textColor: "#111111" })).toMatch(/primary/);
  });
});

describe("verified crawlers (age gate bypass)", () => {
  const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
  const r = (reverse: Record<string, string[]>, forward: Record<string, string[]>) => ({
    reverse: async (ip: string) => reverse[ip] ?? Promise.reject(new Error("ENOTFOUND")),
    lookup: (async (h: string) => (forward[h] ?? []).map((address) => ({ address, family: 4 }))) as any,
  });
  const ip = () => `66.249.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

  it("accepts forward-confirmed reverse DNS from the engine's domain", async () => {
    const a = ip();
    expect(await isVerifiedCrawler(a, GOOGLEBOT, r({ [a]: ["crawl-1.googlebot.com"] }, { "crawl-1.googlebot.com": [a] }))).toBe(true);
  });
  it("rejects a spoofed user agent with an unrelated IP", async () => {
    const a = ip();
    expect(await isVerifiedCrawler(a, GOOGLEBOT, r({ [a]: ["host.evil.example"] }, { "host.evil.example": [a] }))).toBe(false);
  });
  it("rejects when the reverse name does not resolve back to the IP (spoofed PTR)", async () => {
    const a = ip();
    expect(await isVerifiedCrawler(a, GOOGLEBOT, r({ [a]: ["crawl-1.googlebot.com"] }, { "crawl-1.googlebot.com": ["1.2.3.4"] }))).toBe(false);
  });
  it("rejects normal browsers without any DNS work", async () => {
    expect(await isVerifiedCrawler("1.2.3.4", "Mozilla/5.0 Chrome/120", r({}, {}))).toBe(false);
    expect(await isVerifiedCrawler(null, GOOGLEBOT, r({}, {}))).toBe(false);
  });
});

// ---- database-backed: Page isolation, merging, sitemap builders
const run = Date.now().toString(36);
let tA: string, tB: string;
let tenantRow: any;

describe("pages + sitemaps (integration)", () => {
  beforeAll(async () => {
    const plan = await platformDb.plan.upsert({ where: { key: "free" }, update: {}, create: { key: "free", name: "Free" } });
    const mk = (slug: string, extra: object = {}) =>
      platformDb.tenant.create({ data: { slug, name: slug, planId: plan.id, features: { categories: true }, profile: { contactEmail: "c@x.test" }, ...extra }, include: { plan: true } });
    tenantRow = await mk(`pgs-a-${run}`);
    tA = tenantRow.id;
    tB = (await mk(`pgs-b-${run}`, { contentCategory: "ADULT" })).id;
    for (let i = 1; i <= 3; i++) {
      await platformDb.video.create({ data: { tenantId: tA, title: `Video ${i}`, status: "READY", visibility: "PUBLIC", ingestMethod: "DIRECT", thumbnailPath: "x/thumb.jpg", durationSec: 60, tags: ["alpha", i === 3 ? "solo" : "beta"], seo: i === 2 ? { noindex: true } : {} } });
    }
    await platformDb.category.create({ data: { tenantId: tA, name: "Cats", slug: "cats" } });
    await platformDb.page.create({ data: { tenantId: tA, slug: "our-story", title: "Our story", content: "Hello", published: true } });
    await platformDb.page.create({ data: { tenantId: tA, slug: "hidden", title: "Hidden", content: "x", published: false } });
    await platformDb.page.create({ data: { tenantId: tA, slug: "privacy", systemKey: "privacy", title: "Our Privacy", content: "Custom privacy text", seo: { description: "Custom desc" } } });
    await platformDb.page.create({ data: { tenantId: tA, slug: "terms", systemKey: "terms", title: "Terms", content: "x", published: false } }); // mandatory: unpublish ignored
    await platformDb.page.create({ data: { tenantId: tB, slug: "b-only", title: "B only", content: "secret" } });
  });
  afterAll(async () => {
    await platformDb.tenant.deleteMany({ where: { slug: { endsWith: `-${run}` } } });
    await baseClient.$disconnect();
  });

  it("Page rows are isolated per tenant (wrapper + RLS)", async () => {
    expect((await tenantDb(tA).page.findMany()).every((p) => p.tenantId === tA)).toBe(true);
    expect(await tenantDb(tA).page.findFirst({ where: { slug: "b-only" } })).toBeNull();
    expect(await baseClient.page.findMany()).toHaveLength(0); // no context = no rows
  });

  it("merges generated + customised + custom pages; mandatory pages cannot be hidden", async () => {
    const pages = await loadPages(tenantRow, "https://a.test");
    const by = (slug: string) => pages.find((p) => p.slug === slug)!;
    expect(by("about").customized).toBe(false);
    expect(by("about").markdown).toContain("pgs-a");
    expect(by("privacy")).toMatchObject({ customized: true, title: "Our Privacy", markdown: "Custom privacy text", description: "Custom desc" });
    expect(by("terms").published).toBe(true); // stored unpublished, but mandatory
    expect(by("our-story")).toMatchObject({ custom: true, published: true });
    expect(by("hidden").published).toBe(false);
    expect(pages.some((p) => p.key === "2257")).toBe(false); // not adult
    const adult = await loadPages({ ...tenantRow, id: tB, contentCategory: "ADULT" }, "https://b.test");
    expect(adult.map((p) => p.key)).toEqual(expect.arrayContaining(["2257", "parental"]));
  });

  it("footer groups link legal/help/custom pages and omit hidden ones", async () => {
    const groups = footerGroups(await loadPages(tenantRow, "https://a.test"), { hasCategories: true });
    const titles = (g: string) => groups.find((x) => x.title === g)?.links.map((l) => l.href) ?? [];
    expect(titles("Explore")).toEqual(expect.arrayContaining(["/", "/trending", "/categories", "/sitemap"]));
    expect(titles("Legal")).toEqual(expect.arrayContaining(["/privacy", "/terms", "/dmca", "/cookies"]));
    expect(titles("Help")).toEqual(expect.arrayContaining(["/about", "/contact", "/faq"]));
    expect(titles("More")).toContain("/our-story");
    expect(titles("More")).not.toContain("/hidden");
  });

  const tenantForSitemap = () => ({ id: tA, slug: `pgs-a-${run}`, name: "A", planKey: "free", contentCategory: "GENERAL" as const, templateId: "classic-grid", theme: {}, features: { categories: true }, seo: {}, profile: {}, logoUrl: null, faviconUrl: null });

  it("sitemap index lists main + video chunks", async () => {
    const xml = await buildIndex(tenantForSitemap() as any, "https://a.test");
    expect(xml).toContain("<sitemapindex");
    expect(xml).toContain("https://a.test/sitemaps/main.xml");
    expect(xml).toContain("https://a.test/sitemaps/videos-1.xml");
  });
  it("main sitemap: sections, categories, multi-video tags only, published pages only", async () => {
    const urls = (await buildMain(tenantForSitemap() as any, "https://a.test")).join("");
    for (const u of ["/trending", "/categories", "/c/cats", "/tag/alpha", "/our-story", "/privacy", "/about"]) expect(urls, u).toContain(`https://a.test${u}<`);
    expect(urls).not.toContain("/tag/solo<"); // single-video tag = thin page
    expect(urls).not.toContain("/hidden<");
  });
  it("video sitemap: excludes noindex videos, includes video + image metadata with tags", async () => {
    const entries = await buildVideos(tenantForSitemap() as any, "https://a.test", 1);
    expect(entries).toHaveLength(2); // 3 videos, one noindex
    const xml = entries.join("");
    expect(xml).toContain("<video:tag>alpha</video:tag>");
    expect(xml).toContain("<video:player_loc>");
    expect(xml).toContain("thumb-lg.jpg"); // large poster for rich results
  });
  it("noindex sites publish empty sitemaps", async () => {
    const t = { ...tenantForSitemap(), features: { noindex: true } } as any;
    expect(await buildMain(t, "https://a.test")).toEqual([]);
    expect(await buildVideos(t, "https://a.test", 1)).toEqual([]);
    expect(await buildIndex(t, "https://a.test")).not.toContain("<sitemap>");
  });
});
