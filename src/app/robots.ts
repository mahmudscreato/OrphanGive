// Robots directives. Next.js serves this at /robots.txt.
//
// Strategy: allow indexing of all public marketing/charity surfaces;
// block donor-side and flow-state URLs. Donor dashboard is private
// (auth-gated) but Disallow is belt-and-braces. /sponsor/* URLs
// carry cart state and shouldn't be cached by crawlers. /api/* and
// /reset-password / /forgot-password are obvious never-indexes.

import type { MetadataRoute } from "next";

const BASE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://orphangive.org"
).replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard/",
          "/api/",
          "/sponsor/",
          "/checkout",
          "/checkout/",
          "/cart",
          "/reset-password",
          "/forgot-password",
          "/signup/verify",
          "/auth/",
          // Lot 4 — Admin OS surfaces now live on this app (sessions
          // 50+). All auth-gated; block crawlers defensively in
          // addition to the per-layout noindex metadata.
          "/admin",
          "/admin/",
          "/di",
          "/di/",
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
