import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "ghostmap.jp" },
      { protocol: "https", hostname: "**.ghostmap.jp" },
    ],
  },
  experimental: {
    optimizePackageImports: ["framer-motion"],
  },
  // D1 (drizzle-orm/d1) is Workers-native — no external packages needed (unlike pg before).
};

export default nextConfig;
