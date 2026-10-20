import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/register`, changeFrequency: "monthly", priority: 0.8 },
    ...["about", "contact", "privacy", "dmca", "cookies", "terms", "aup"].map((p) => ({ url: `${base}/${p}`, changeFrequency: "yearly" as const, priority: 0.3 })),
  ];
}
