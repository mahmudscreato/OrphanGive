import type { NextConfig } from "next";
import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Session 15b1 — emit a self-contained server bundle for the
  // production Docker image. Standalone mode resolves all
  // dependencies and produces .next/standalone/server.js + a
  // minimal node_modules tree, so the runtime container doesn't
  // need a fresh `npm install`. See Dockerfile for the matching
  // multi-stage build.
  output: "standalone",
  turbopack: {
    root: path.join(__dirname),
  },
  images: {
    qualities: [75, 85],
    // Session 15b2 batch 7 — allow Next.js's image optimizer to
    // proxy images from our Cloudinary account. Tightly scoped to
    // the `dh9w1apsk` cloud prefix so we don't accidentally
    // optimize someone else's Cloudinary content. Add additional
    // patterns here when new image hosts are introduced (e.g.
    // Directus assets domain, if those ever go through next/image).
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/dh9w1apsk/**",
      },
    ],
  },
  async redirects() {
    return [
      {
        source: "/dashboard/children",
        destination: "/dashboard/sponsorships",
        permanent: true,
      },
    ];
  },
};

// Session 21 — Sentry build-time wrapper. The wrapper:
//   - detects sentry.{client,server,edge}.config.ts and wires
//     them into the runtime bundles
//   - uploads source maps on `next build` IF SENTRY_AUTH_TOKEN +
//     SENTRY_ORG + SENTRY_PROJECT env vars are present (they are
//     not, currently — uploads are skipped silently)
//
// TODO Mahmud: when ready to activate Sentry, set on the VPS:
//   SENTRY_DSN              (server runtime)
//   NEXT_PUBLIC_SENTRY_DSN  (browser runtime)
//   SENTRY_ORG              (source-map upload — optional)
//   SENTRY_PROJECT          (source-map upload — optional)
//   SENTRY_AUTH_TOKEN       (source-map upload — optional)
// All four sentry.*.config.ts files no-op until the DSN appears.
const sentryWebpackPluginOptions = {
  // Suppress logs in CI / production builds. Keep them in dev.
  silent: process.env.NODE_ENV === "production",
  // Source-map upload is opt-in via env vars. The wrapper checks
  // for SENTRY_AUTH_TOKEN at build time and skips upload if absent.
  // No additional flag needed here.
};

export default withSentryConfig(nextConfig, sentryWebpackPluginOptions);
