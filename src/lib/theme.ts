import { z } from "zod";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex colour like #2563eb");

export const FONTS = {
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  rounded: '"Trebuchet MS", "Segoe UI", sans-serif',
} as const;

export const themeSchema = z.object({
  primaryColor: hex.default("#2563eb"),
  bgColor: hex.default("#ffffff"),
  textColor: hex.default("#111827"),
  font: z.enum(["system", "serif", "mono", "rounded"]).default("system"),
  radius: z.number().int().min(0).max(24).default(8),
  density: z.enum(["compact", "comfortable", "spacious"]).default("comfortable"),
  customCss: z.string().max(20_000).default(""),
});
export type Theme = z.infer<typeof themeSchema>;

export const featuresSchema = z.object({
  comments: z.boolean().default(false),
  categories: z.boolean().default(true),
  search: z.boolean().default(true),
  likes: z.boolean().default(false),
  ageGate: z.boolean().default(false),
  downloads: z.boolean().default(false),
  noindex: z.boolean().default(false),
});
export type Features = z.infer<typeof featuresSchema>;

export const parseTheme = (v: unknown): Theme => themeSchema.parse(v && typeof v === "object" ? v : {});
export const parseFeatures = (v: unknown): Features => featuresSchema.parse(v && typeof v === "object" ? v : {});

const GAP = { compact: "0.75rem", comfortable: "1.25rem", spacious: "2rem" } as const;
const MIN_CARD = { compact: "11rem", comfortable: "15rem", spacious: "19rem" } as const;

/** Theme tokens -> CSS variables. Values are all validated enums/hex/ints, so this string is safe to inline. */
export function themeToCssVars(t: Theme): string {
  return [
    `--primary:${t.primaryColor}`,
    `--bg:${t.bgColor}`,
    `--text:${t.textColor}`,
    `--font:${FONTS[t.font]}`,
    `--radius:${t.radius}px`,
    `--gap:${GAP[t.density]}`,
    `--card-min:${MIN_CARD[t.density]}`,
  ].join(";");
}

/**
 * Tenant-supplied CSS (premium). Conservative allow-list approach: reject rather than rewrite.
 * Blocks anything that can load remote code/trackers or break out of the <style> element.
 */
export function validateCustomCss(css: string): { ok: true } | { ok: false; reason: string } {
  if (css.length > 20_000) return { ok: false, reason: "CSS is too long (max 20 KB)" };
  const banned: [RegExp, string][] = [
    [/<\/?\s*style|<\s*script|<!--/i, "HTML is not allowed in CSS"],
    [/@import/i, "@import is not allowed"],
    [/expression\s*\(|behavior\s*:|-moz-binding|javascript\s*:/i, "Script-like CSS is not allowed"],
    [/url\s*\(\s*['"]?\s*(?!https:|data:image\/)/i, "url() may only reference https: or data:image/ sources"],
    [/@font-face/i, "@font-face is not allowed"],
  ];
  for (const [re, reason] of banned) if (re.test(css)) return { ok: false, reason };
  return { ok: true };
}

/** Free plans choose a preset; custom colours/fonts are a premium entitlement (enforced in the dashboard actions). */
export const THEME_PRESETS: Record<string, { label: string; theme: Partial<Theme> }> = {
  classic: { label: "Classic blue", theme: { primaryColor: "#2563eb", bgColor: "#ffffff", textColor: "#111827" } },
  midnight: { label: "Midnight", theme: { primaryColor: "#38bdf8", bgColor: "#0f172a", textColor: "#e5e7eb" } },
  forest: { label: "Forest", theme: { primaryColor: "#15803d", bgColor: "#f7fdf9", textColor: "#14231a" } },
  sunset: { label: "Sunset", theme: { primaryColor: "#ea580c", bgColor: "#fff7ed", textColor: "#2b1608" } },
};
export const presetTheme = (key: string): Theme => parseTheme({ ...(THEME_PRESETS[key]?.theme ?? THEME_PRESETS.classic.theme) });
