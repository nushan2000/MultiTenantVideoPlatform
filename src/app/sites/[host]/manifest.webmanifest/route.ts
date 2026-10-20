import { parseTheme } from "@/lib/theme";
import { parseSiteSeo } from "@/lib/seo";
import { tenantForHost } from "@/lib/storefront";

export const dynamic = "force-dynamic";

// Per-site web app manifest: name, theme colour and icons (installability + the right icon/colour in mobile browsers).
export async function GET(_req: Request, { params }: { params: Promise<{ host: string }> }) {
  const t = await tenantForHost((await params).host);
  if (!t) return new Response("Not found", { status: 404 });
  const theme = parseTheme(t.theme);
  const icon = t.faviconUrl ?? t.logoUrl;
  const type = icon?.endsWith(".png") ? "image/png" : icon?.endsWith(".webp") ? "image/webp" : "image/jpeg";
  const manifest = {
    name: t.name, short_name: t.name.slice(0, 12), description: parseSiteSeo(t.seo).homeDescription || `Watch videos on ${t.name}`,
    start_url: "/", scope: "/", display: "standalone", background_color: theme.bgColor, theme_color: theme.primaryColor,
    icons: icon ? [{ src: icon, sizes: "any", type, purpose: "any" }] : [],
  };
  return new Response(JSON.stringify(manifest), { headers: { "content-type": "application/manifest+json", "cache-control": "public, max-age=3600" } });
}
