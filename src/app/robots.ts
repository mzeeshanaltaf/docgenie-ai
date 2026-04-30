import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/about", "/privacy", "/terms"],
        disallow: ["/dashboard", "/api/"],
      },
    ],
    sitemap: "https://docgenie.zeeshanai.cloud/sitemap.xml",
  };
}
