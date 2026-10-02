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
  // Keep `pg` and its native bindings external — required for Cloudflare Workers with `nodejs_compat`.
  // `pg` is only used when `DATABASE_URL` is set; otherwise the app falls back to `data/spots.geojson` (Workers-friendly).
  // Marking them external prevents OpenNext's esbuild from trying to bundle optional `pg-native` / `pg-cloudflare`.
  serverExternalPackages: ["pg", "pg-native", "pg-cloudflare"],
};

// Cloudflare Workers dev: ensure `.dev.vars` / bindings are available in `next dev`
// https://opennext.js.org/cloudflare/get-started#4-local-development
// `next.config.ts` is loaded via ESM — use dynamic import without top-level await to keep `ES2017` target compatible
if (process.env.NODE_ENV !== "production") {
  void import("@opennextjs/cloudflare").then(({ initOpenNextCloudflareForDev }) =>
    initOpenNextCloudflareForDev()
  );
}

export default nextConfig;
