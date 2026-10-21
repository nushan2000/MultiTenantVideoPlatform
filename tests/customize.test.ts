import { describe, expect, it } from "vitest";
import { footerGroups, navLinksFor, type FooterPage } from "@/lib/pages/footer";
import { parseSiteSeo, seoHealth } from "@/lib/seo";
import { THEME_PRESETS, checkThemeContrast, presetTheme } from "@/lib/theme";

describe("theme presets", () => {
  it("every preset is readable and resolves to itself (the customizer offers exactly these)", () => {
    for (const [key, p] of Object.entries(THEME_PRESETS)) {
      expect(checkThemeContrast(presetTheme(key)), key).toBeNull();
      expect(presetTheme(key).primaryColor).toBe(p.theme.primaryColor);
    }
  });
  it("offers the eight curated presets", () => {
    expect(Object.keys(THEME_PRESETS)).toEqual(expect.arrayContaining(["royal", "obsidian", "crimson", "nordic"]));
  });
});

describe("shared header/footer logic", () => {
  const pages: FooterPage[] = [
    { key: "about", slug: "about", title: "About", customized: false, group: "help", published: true, inFooter: true },
    { key: "dmca", slug: "dmca", title: "DMCA", customized: false, group: "legal", published: true, inFooter: true },
    { key: null, slug: "press", title: "Press", customized: false, group: "more", published: false, inFooter: true },
  ];
  it("footer skips unpublished pages and relabels DMCA", () => {
    const g = footerGroups(pages, { hasCategories: true });
    expect(g.find((x) => x.title === "Legal")?.links[0].title).toBe("Copyright / DMCA");
    expect(g.find((x) => x.title === "More")).toBeUndefined();
    expect(g[0].links.map((l) => l.title)).toContain("Categories");
  });
  it("nav shows About only when published", () => {
    expect(navLinksFor(pages, { hasCategories: false }).map((l) => l.title)).toEqual(["Home", "Trending", "About"]);
    expect(navLinksFor([{ key: "about", published: false }], { hasCategories: false }).map((l) => l.title)).toEqual(["Home", "Trending"]);
  });
});

describe("SEO health covers pages and theme", () => {
  const base = {
    seo: parseSiteSeo({}), siteName: "Acme", hasLogo: true, hasFavicon: true, hasActiveCustomDomain: false, noindex: false,
    videos: { total: 0, withDescription: 0, withThumbnail: 0, customSeo: 0 }, categories: { total: 0, withSeo: 0 },
  };
  it("flags missing business details, noindexed pages and unreadable themes", () => {
    const h = seoHealth({ ...base, pages: { total: 8, withDescription: 8, noindexed: 2, businessDetailsFilled: false }, themeContrastIssue: "too light" });
    const byId = Object.fromEntries(h.items.map((i) => [i.id, i.level]));
    expect(byId["business-details"]).toBe("bad");
    expect(byId["pages-indexable"]).toBe("warn");
    expect(byId["theme-contrast"]).toBe("bad");
    const ok = seoHealth({ ...base, pages: { total: 8, withDescription: 8, noindexed: 0, businessDetailsFilled: true }, themeContrastIssue: null });
    expect(ok.items.filter((i) => ["business-details", "pages-indexable", "theme-contrast"].includes(i.id)).every((i) => i.level === "good")).toBe(true);
  });
});
