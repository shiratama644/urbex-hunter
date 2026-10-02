import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  // D1: ローカルは `wrangler d1 execute --local` または `drizzle-kit push --config=drizzle.config.ts` で反映
  // 本番は `wrangler d1 migrations apply urbex-hunter-db`
  // 認証は wrangler のログインに依存（CLOUDFLARE_API_TOKEN / wrangler login）
  dbCredentials: {
    url: "file:./dev.db",
  },
});
