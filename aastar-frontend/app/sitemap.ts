import type { MetadataRoute } from "next";

// Public, crawlable routes. Served at /sitemap.xml by Next's file convention.
// App pages behind auth (dashboard, transfer, …) are intentionally excluded.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://yaa.aastar.io";
  const routes = ["", "/about", "/contact", "/privacy", "/terms", "/auth/login", "/auth/register"];
  return routes.map(path => ({
    url: `${base}${path}`,
    changeFrequency: "monthly",
    priority: path === "" ? 1 : 0.6,
  }));
}
