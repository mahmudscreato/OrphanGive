import type { NextConfig } from "next";
import path from "node:path";

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

export default nextConfig;
