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
