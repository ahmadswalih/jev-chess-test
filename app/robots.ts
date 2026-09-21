import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Nothing to gain from crawling the game endpoints.
      disallow: "/api/",
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
