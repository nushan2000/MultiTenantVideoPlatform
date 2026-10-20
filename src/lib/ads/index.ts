import sanitizeHtml from "sanitize-html";
import { platformDb } from "../db/client";
import { entitlements } from "../entitlements";
import { getEnv } from "../env";

export type ResolvedAds = {
  source: "platform" | "tenant" | "none";
  vastTagUrl: string | null;
  bannerHtml: string | null; // already sanitised
};

/** Ad networks that disallow adult content: adult-flagged sites may not point ads at them. */
export const ADULT_DISALLOWED_AD_HOSTS = [
  "doubleclick.net", "googlesyndication.com", "googleadservices.com", "imasdk.googleapis.com", "adsense.google.com",
  "adservice.google.com", "facebook.com", "fbcdn.net", "taboola.com", "outbrain.com", "amazon-adsystem.com",
];

const hostIsDisallowed = (host: string) => ADULT_DISALLOWED_AD_HOSTS.some((d) => host === d || host.endsWith(`.${d}`));

export function sanitizeAdHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ["a", "img", "div", "span", "p", "strong", "em", "br", "iframe"],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt", "width", "height"],
      iframe: ["src", "width", "height", "frameborder", "sandbox", "referrerpolicy"],
      "*": ["style", "class"],
    },
    allowedSchemes: ["https"],
    allowedSchemesByTag: { img: ["https", "data"] },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer sponsored", target: "_blank" }),
      iframe: sanitizeHtml.simpleTransform("iframe", { sandbox: "allow-scripts allow-popups", referrerpolicy: "no-referrer" }),
    },
    allowedStyles: { "*": { width: [/^\d+(px|%)$/], height: [/^\d+(px|%)$/], "max-width": [/^\d+(px|%)$/], "text-align": [/^(left|center|right)$/] } },
  });
}

function urlsIn(html: string): string[] {
  return [...html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
}

export type AdInputCheck = { ok: true; vastTagUrl: string | null; htmlSnippet: string | null } | { ok: false; error: string };

/** Validates tenant-provided ad settings at save time (https only, adult-network block, sanitised HTML). */
export function checkAdInput(contentCategory: string, input: { vastTagUrl?: string | null; htmlSnippet?: string | null }): AdInputCheck {
  let vast: string | null = null;
  if (input.vastTagUrl?.trim()) {
    try {
      const u = new URL(input.vastTagUrl.trim());
      if (u.protocol !== "https:") return { ok: false, error: "The VAST tag must be an https:// URL" };
      if (contentCategory === "ADULT" && hostIsDisallowed(u.hostname)) {
        return { ok: false, error: `${u.hostname} does not allow adult content. Use an adult-friendly ad network.` };
      }
      vast = u.toString();
    } catch {
      return { ok: false, error: "The VAST tag is not a valid URL" };
    }
  }
  let html: string | null = null;
  if (input.htmlSnippet?.trim()) {
    if (input.htmlSnippet.length > 10_000) return { ok: false, error: "The HTML snippet is too long (max 10 KB)" };
    const clean = sanitizeAdHtml(input.htmlSnippet);
    if (contentCategory === "ADULT") {
      for (const raw of urlsIn(clean)) {
        try {
          if (hostIsDisallowed(new URL(raw).hostname)) return { ok: false, error: "The snippet references an ad network that does not allow adult content." };
        } catch {}
      }
    }
    html = clean;
  }
  return { ok: true, vastTagUrl: vast, htmlSnippet: html };
}

function platformAds(contentCategory: string): ResolvedAds {
  const env = getEnv();
  const vast = contentCategory === "ADULT" ? env.PLATFORM_ADULT_VAST_TAG_URL : env.PLATFORM_VAST_TAG_URL;
  return { source: vast ? "platform" : "none", vastTagUrl: vast ?? null, bannerHtml: null };
}

/**
 * AdProvider: resolves ad config per request.
 * Free plan: ALWAYS the platform's ads (cannot be disabled or changed). Premium: the tenant's own AdConfig.
 */
export async function resolveAds(tenant: { id: string; planKey: string; contentCategory: string }): Promise<ResolvedAds> {
  const e = entitlements(tenant.planKey);
  if (!e.canControlAds) return platformAds(tenant.contentCategory);

  const cfg = await platformDb.adConfig.findFirst({ where: { tenantId: tenant.id } });
  if (!cfg || cfg.mode === "PLATFORM") return platformAds(tenant.contentCategory);
  if (!cfg.enabled) return { source: "none", vastTagUrl: null, bannerHtml: null };

  // Re-validate at render time too: config may predate a category change.
  const checked = checkAdInput(tenant.contentCategory, { vastTagUrl: cfg.vastTagUrl, htmlSnippet: cfg.htmlSnippet });
  if (!checked.ok) return { source: "none", vastTagUrl: null, bannerHtml: null };
  return { source: "tenant", vastTagUrl: checked.vastTagUrl, bannerHtml: checked.htmlSnippet };
}
