// Pure SEO helpers: no server-only imports, so the dashboard's live preview can share them.
import { z } from "zod";

/** Plain text only: strip tags/control chars, collapse whitespace. (Next escapes on output; this also keeps stored data clean.) */
export const stripText = (s: string) =>
  s.replace(/<[^>]*>/g, "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

const text = (max: number) => z.string().max(max * 2).transform(stripText).pipe(z.string().max(max));

/** https URL, or one of our own media paths (/api/media/...). */
const imageUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || v.startsWith("/api/media/") || /^https:\/\/[^\s]+$/.test(v), "Use an https:// image URL or upload an image");

const httpsUrl = z.string().trim().max(500).refine((v) => v === "" || /^https:\/\/[^\s]+$/.test(v), "Use an https:// URL");

/** "a, b, c" or array -> clean unique keyword list (max 15). */
export const keywordList = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : v.split(",")))
  .transform((a) => [...new Set(a.map(stripText).filter(Boolean).map((k) => k.slice(0, 40)))].slice(0, 15));

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const opt = <T extends z.ZodTypeAny>(s: T) => z.preprocess(emptyToUndefined, s.optional());

export const siteSeoSchema = z.object({
  /** Must contain %s (the page title). Example: "%s | My Videos" */
  titleTemplate: opt(text(80).refine((v) => v.includes("%s"), "The template must contain %s where the page title goes")),
  homeTitle: opt(text(70)),
  homeDescription: opt(text(300)),
  keywords: keywordList.default([]),
  ogImage: opt(imageUrl),
  twitterHandle: opt(z.string().trim().regex(/^@?[A-Za-z0-9_]{1,15}$/, "Enter a handle like @mychannel")),
  locale: opt(z.string().trim().regex(/^[a-z]{2}([_-][A-Za-z]{2})?$/, "Use a locale like en or en_US")),
  organizationName: opt(text(80)),
  googleVerification: opt(z.string().trim().regex(/^[A-Za-z0-9_-]{10,100}$/, "Paste only the verification code")),
  bingVerification: opt(z.string().trim().regex(/^[A-Za-z0-9_-]{10,100}$/, "Paste only the verification code")),
  socials: z.array(httpsUrl).transform((a) => a.filter(Boolean)).pipe(z.array(z.string()).max(8)).default([]),
});
export type SiteSeo = z.infer<typeof siteSeoSchema>;

/** URL handle (the slug in /v/<handle> or /c/<handle>), like a Shopify "URL handle". */
export const HANDLE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const looksLikeId = (v: string) => /^c[a-z0-9]{24}$/.test(v); // cuid: reserved so a handle can never shadow an id
export const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(80, "Use at most 80 characters")
  .refine((v) => HANDLE_RE.test(v), "Use lowercase letters, numbers and single hyphens")
  .refine((v) => !looksLikeId(v), "This handle is reserved");
export const slugifyHandle = (text: string) =>
  stripText(text).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

/** Per-page overrides (home uses SiteSeo; videos and categories use this). */
export const pageSeoSchema = z.object({
  /** URL handle. Empty = default URL. Changing it keeps the old URL working via a 308 redirect (see previousHandles). */
  handle: opt(handleSchema),
  /** Server-managed list of retired handles that redirect to the current URL. Ignored on input (see pageSeoInputSchema). */
  previousHandles: z.array(z.string()).max(25).default([]),
  title: opt(text(70)),
  description: opt(text(300)),
  keywords: keywordList.default([]),
  ogImage: opt(imageUrl),
  canonicalUrl: opt(httpsUrl),
  noindex: z.boolean().default(false),
});
export type PageSeo = z.infer<typeof pageSeoSchema>;
/** What a client may send: everything except server-managed fields. */
export const pageSeoInputSchema = pageSeoSchema.omit({ previousHandles: true });
export type PageSeoInput = z.infer<typeof pageSeoInputSchema>;

/** Tolerant readers for stored JSON (bad/legacy data degrades to "no override", never throws). */
export function parseSiteSeo(v: unknown): SiteSeo {
  const r = siteSeoSchema.safeParse(v && typeof v === "object" ? v : {});
  return r.success ? r.data : siteSeoSchema.parse({});
}
export function parsePageSeo(v: unknown): PageSeo {
  const r = pageSeoSchema.safeParse(v && typeof v === "object" ? v : {});
  return r.success ? r.data : pageSeoSchema.parse({});
}

/** Apply a "%s | Site" style template. */
export const applyTitleTemplate = (template: string | undefined, title: string, siteName: string) =>
  (template?.includes("%s") ? template : `%s · ${siteName}`).replace("%s", title);

export const truncate = (s: string, max: number) => (s.length <= max ? s : s.slice(0, max - 1).replace(/\s+\S*$/, "") + "…");

/** First ~155 chars of free text, for auto-generated descriptions. */
export const autoDescription = (text: string | null | undefined, fallback: string) => truncate(stripText(text ?? "") || fallback, 155);

// ------------------------------------------------------------------ analysis (used for the dashboard hints)

export type Hint = { level: "good" | "warn" | "bad"; message: string };

export const TITLE_IDEAL = [30, 60] as const;
export const DESC_IDEAL = [70, 160] as const;

export function analyzeTitle(title: string): Hint {
  const n = title.length;
  if (n === 0) return { level: "bad", message: "Add a title: search engines show it as the clickable headline." };
  if (n < TITLE_IDEAL[0]) return { level: "warn", message: `Short title (${n} chars). Aim for ${TITLE_IDEAL[0]}-${TITLE_IDEAL[1]}.` };
  if (n > TITLE_IDEAL[1]) return { level: "warn", message: `Long title (${n} chars). Google usually cuts it after ~${TITLE_IDEAL[1]}.` };
  return { level: "good", message: `Good length (${n} chars).` };
}

export function analyzeDescription(desc: string): Hint {
  const n = desc.length;
  if (n === 0) return { level: "bad", message: "Add a description: it is the snippet shown under your title in search results." };
  if (n < DESC_IDEAL[0]) return { level: "warn", message: `Short description (${n} chars). Aim for ${DESC_IDEAL[0]}-${DESC_IDEAL[1]}.` };
  if (n > DESC_IDEAL[1]) return { level: "warn", message: `Long description (${n} chars). It will be cut after ~${DESC_IDEAL[1]}.` };
  return { level: "good", message: `Good length (${n} chars).` };
}

export type HealthInput = {
  seo: SiteSeo;
  siteName: string;
  hasLogo: boolean;
  hasFavicon: boolean;
  hasActiveCustomDomain: boolean;
  noindex: boolean;
  videos: { total: number; withDescription: number; withThumbnail: number; customSeo: number };
  categories: { total: number; withSeo: number };
};

/** Checklist shown on the SEO tab: each item is a concrete, fixable thing. */
export function seoHealth(i: HealthInput): { score: number; items: (Hint & { id: string })[] } {
  const items: (Hint & { id: string })[] = [];
  const add = (id: string, ok: boolean | "warn", good: string, bad: string, weight = 1) => {
    items.push({ id, level: ok === true ? "good" : ok === "warn" ? "warn" : "bad", message: ok === true ? good : bad });
    weights[id] = weight;
  };
  const weights: Record<string, number> = {};
  const home = i.seo.homeTitle || i.siteName;
  const t = analyzeTitle(home);
  add("home-title", t.level === "good" ? true : t.level === "bad" ? false : "warn", "Home page title looks good.", `Home title: ${t.message}`, 2);
  const d = analyzeDescription(i.seo.homeDescription ?? "");
  add("home-desc", d.level === "good" ? true : d.level === "bad" ? false : "warn", "Home page description looks good.", `Home description: ${d.message}`, 2);
  add("og-image", !!i.seo.ogImage || i.hasLogo, "A social sharing image is set.", "Add a social sharing image (1200x630 works best) so links look great on social networks.");
  add("favicon", i.hasFavicon, "Favicon is set.", "Upload a favicon (shown in browser tabs and some search results).");
  add("keywords", i.seo.keywords.length > 0, "Site keywords are set.", "Add a few relevant keywords (optional; mostly helps Bing and internal search).", 0.5);
  add("verification", !!(i.seo.googleVerification || i.seo.bingVerification), "Search-engine verification is set up.", "Add your Google Search Console / Bing Webmaster verification code so you can submit your sitemap.");
  add("socials", i.seo.socials.length > 0, "Social profiles are linked (used in structured data).", "Link your social profiles to strengthen your brand's structured data.", 0.5);
  add("domain", i.hasActiveCustomDomain || "warn", "Your custom domain is the canonical address.", "Premium tip: a custom domain builds your own search authority instead of sharing the platform's.", 0.5);
  add("indexable", !i.noindex, "Search engines may index your site.", "Your site is set to noindex: search engines will not list it.", 3);
  if (i.videos.total > 0) {
    const descPct = i.videos.withDescription / i.videos.total;
    add("video-desc", descPct >= 0.8 ? true : descPct >= 0.4 ? "warn" : false, "Most videos have descriptions.", `Only ${i.videos.withDescription} of ${i.videos.total} videos have descriptions. Descriptive text is how videos get found.`, 2);
    const thumbPct = i.videos.withThumbnail / i.videos.total;
    add("video-thumb", thumbPct >= 0.95, "Videos have thumbnails.", "Some videos are missing thumbnails (video rich results need them).");
  }
  if (i.categories.total > 0) {
    const pct = i.categories.withSeo / i.categories.total;
    add("category-seo", pct >= 0.8 ? true : "warn", "Categories have their own titles/descriptions.", `${i.categories.total - i.categories.withSeo} of ${i.categories.total} categories use auto-generated metadata. Custom text ranks better.`, 0.5);
  }
  const max = items.reduce((s, it) => s + (weights[it.id] ?? 1), 0);
  const got = items.reduce((s, it) => s + (weights[it.id] ?? 1) * (it.level === "good" ? 1 : it.level === "warn" ? 0.5 : 0), 0);
  return { score: max ? Math.round((got / max) * 100) : 0, items };
}
