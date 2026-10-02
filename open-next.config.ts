import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Minimal Cloudflare config for urbex-hunter.
// - Uses Workers runtime with nodejs_compat (wrangler.jsonc)
// - Incremental cache: for `revalidate=86400` on pages/API routes.
//   Default is in-memory; for production persistence across isolates
//   configure R2 (see https://opennext.js.org/cloudflare/caching)
//   Example:
//   import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
//   export default defineCloudflareConfig({ incrementalCache: r2IncrementalCache });
//
export default defineCloudflareConfig({
  // Uncomment to enable R2 incremental cache (requires R2 bucket + wrangler binding):
  // incrementalCache: r2IncrementalCache,
});
