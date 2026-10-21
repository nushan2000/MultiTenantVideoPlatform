// Pure (no database access): shared by the storefront layout and the dashboard's live preview, so the preview shows the real footer.

export type FooterPage = { key: string | null; slug: string; title: string; customized: boolean; group: "help" | "legal" | "more"; published: boolean; inFooter: boolean };
export type FooterGroup = { title: string; links: { title: string; href: string }[] };

const FOOTER_LABEL: Record<string, string> = { dmca: "Copyright / DMCA", "2257": "2257 Statement", community: "Community Guidelines" };

export function footerGroups(pages: FooterPage[], opts: { hasCategories: boolean; playlists?: { slug: string; title: string }[] }): FooterGroup[] {
  const live = pages.filter((p) => p.published && p.inFooter);
  const link = (p: FooterPage) => ({ title: (!p.customized && p.key && FOOTER_LABEL[p.key]) || p.title, href: `/${p.slug}` });
  const groups: FooterGroup[] = [
    { title: "Explore", links: [{ title: "Home", href: "/" }, { title: "Trending", href: "/trending" }, ...(opts.hasCategories ? [{ title: "Categories", href: "/categories" }] : []), ...(opts.playlists ?? []).slice(0, 4).map((p) => ({ title: p.title, href: `/playlist/${p.slug}` })), { title: "Site map", href: "/sitemap" }] },
    { title: "Help", links: live.filter((p) => p.group === "help").map(link) },
    { title: "Legal", links: live.filter((p) => p.group === "legal").map(link) },
    { title: "More", links: live.filter((p) => p.group === "more").map(link) },
  ];
  return groups.filter((g) => g.links.length > 0);
}

/** Header navigation: the same rule the storefront layout uses. */
export function navLinksFor(pages: Pick<FooterPage, "key" | "published">[], opts: { hasCategories: boolean }) {
  return [
    { title: "Home", href: "/" },
    { title: "Trending", href: "/trending" },
    ...(opts.hasCategories ? [{ title: "Categories", href: "/categories" }] : []),
    ...(pages.find((p) => p.key === "about" && p.published) ? [{ title: "About", href: "/about" }] : []),
  ];
}
