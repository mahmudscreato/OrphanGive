import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
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
