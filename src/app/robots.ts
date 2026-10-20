import type { MetadataRoute } from "next";

// Platform host only: tenant hosts are rewritten to their own /robots.txt by the middleware.
export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return {
    rules: [{ userAgent: "*", allow: ["/", "/register"], disallow: ["/dashboard", "/admin", "/api/", "/login"] }],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
