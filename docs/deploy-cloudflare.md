# Cloudflare Workers デプロイガイド — urbex-hunter（vinext + D1）

> Next.js 16 (App Router) × Vite × vinext × Cloudflare Workers（`workerd` + `nodejs_compat`）× D1 (SQLite)  
> `vite build` / `wrangler d1` / `drizzle-orm/d1` で Workers ネイティブに動作。GeoJSON フォールバック（752件）で DB なしでも完全動作。

## なぜ vinext + D1 か

- **vinext** は Vite ベースの Next.js アダプタ。[Cloudflare公式が新規 Next.js アプリに `vinext` を推奨](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)（`npx vinext check` → `vinext init --platform=cloudflare` → `vite build`）。`@opennextjs/cloudflare` は「既存 OpenNext アプリ維持用」として残されているが、本プロジェクトは vinext へ完全移行済み（`open-next.config.ts` 削除、`.open-next` 成果物なし）。
- **D1** は Workers ネイティブの SQLite。Neon/Hyperdrive（Postgres, `pg`）は Workers 外部の TCP 接続で `pg-native`/`pg-cloudflare` の external 化が必要だったが、D1 は `drizzle-orm/d1` + `env.DB` binding で `workerd` 内で完結し、コールドスタート/コネクション/リージョンで有利。未設定時は `src/data/spots.json` フォールバックで即起動。

## このリポジトリで実施した対応（vinext + D1）

| 課題 | 対策 | ファイル |
|---|---|---|
| `runtime = 'edge'` でビルド失敗 | 未使用（`grep -r "runtime.*edge"` で空） | — |
| `node:fs`/`process.cwd()` で `data/spots.geojson` → Workers は FS なし | `src/lib/spots-repo.ts` を **Workers フォールバック**化。`fs` は `dynamic import` で遅延、失敗時は `src/data/spots.json`（`data/spots.geojson` を `src/data/spots.json` へコピー、Turbopack/Vite は `.json` のみ解決）を静的 import。ローカルは `fs` + mtime キャッシュ、Workers は埋め込みデータ。 | `src/lib/spots-repo.ts`, `src/data/spots.json` |
| `pg`/`pg-native` が esbuild/Rolldown で `Could not resolve` | **D1 移行で `pg` 削除**。`src/db/index.ts` は `cloudflare:workers` の `env.DB` から `drizzle(env.DB, { schema })` を `cache()` で生成（OpenNext公式の `cache(() => drizzle(env.MY_D1))` に準拠）。`pg`/`pg-cloudflare`/`@types/pg`/`@opennextjs/cloudflare` を `package.json` から削除、`next.config.ts` の `serverExternalPackages` も削除。 | `src/db/index.ts`, `src/db/schema.ts` (sqliteTable), `package.json`, `next.config.ts`, `vite.config.ts` |
| `cloudflare:workers` が Vite/Rolldown で未解決 | `vite.config.ts` で `cloudflare:workers` を `ssr.external` + `environments.rsc/ssr.build.rolldownOptions.external` に指定。`@tailwindcss/vite` を追加し `globals.css` の `@import "tailwindcss"` を解決。 | `vite.config.ts` |
| `D1 phenomena` が Postgres `text[]` → SQLite は `text` (JSON) | `src/db/schema.ts` は `sqliteTable` + `text` default `'[]'`。`src/lib/spots-repo.ts` は `toRow` で `JSON.stringify`、`rowToFeature` で `JSON.parse`、`phenomenon` 検索は `like` + `instr("phenomena", '"q"')`、facets は `json_each` + `db.all`。 | `src/db/schema.ts`, `src/lib/spots-repo.ts` |
| `postcss` で `@import "tailwindcss"` が `ENOENT` | `@tailwindcss/vite` を `vite.config.ts` の先頭に配置し Vite が解決。`postcss.config.mjs` は `@tailwindcss/postcss` のまま（Next ビルド用）。 | `vite.config.ts`, `postcss.config.mjs` |
| `wrangler.jsonc` の `main: .open-next/worker.js` が vite で `doesn't point to an existing file` | `wrangler.jsonc` を **vinext 用に全面置換**：`main`/`services` (OpenNext) を削除、`assets.directory` を `.open-next/assets` → `dist/client` に、`d1_databases` (binding `DB`) を追加、`images` は維持。`dist/server/wrangler.json` は `vite build` 後に自動生成される。 | `wrangler.jsonc` |
| `vitest` が `cloudflare:workers` を解決できず `FAIL` | `vitest.config.ts` に `resolve.alias: { "cloudflare:workers": "./src/__mocks__/cloudflare-workers.ts" }` を追加。モックは `env: {}` を返しテストは GeoJSON フォールバックで実行。 | `vitest.config.ts`, `src/__mocks__/cloudflare-workers.ts` |
| `drizzle/0002_enable_pg_trgm.sql` (GIN/pg_trgm) が D1 で無効 | 削除し `drizzle-kit generate` で **SQLite 用 `0000_*.sql`** を再生成（`spots` + 3 indexes）。 | `drizzle/0000_*.sql`, `drizzle.config.ts` (dialect: sqlite, url: file:./dev.db) |
| `biome` が `src/data/spots.json` (911KB) を lint | `biome.json` に `overrides: [{ includes: ["src/data/**","data/**"], linter: false }]` | `biome.json` |

## セットアップ済みファイル

```
wrangler.jsonc               # vinext 用: assets dist/client, d1_databases DB, images, compatibility_date 2026-10-02
vite.config.ts               # tailwindcss() + vinext({ images }) + cloudflare({ viteEnvironment: { name: "rsc" } }) + cloudflare:workers external
src/db/schema.ts             # sqliteTable (D1) — 旧 src/db/schema.pg.ts は削除
src/db/index.ts              # getD1Binding / getD1BindingAsync / getDb / getDbAsync / db Proxy (cloudflare:workers)
src/lib/spots-repo.ts        # D1/SQLite 対応 (JSON stringify/parse, like, instr, json_each, db.all, db.run)
src/__mocks__/cloudflare-workers.ts # vitest 用モック
drizzle.config.ts            # dialect: sqlite, schema: ./src/db/schema.ts, out: ./drizzle, url: file:./dev.db
drizzle/0000_*.sql            # D1 用マイグレーション (CREATE TABLE spots + 3 indexes)
src/data/spots.json          # data/spots.geojson のコピー（.json で Vite/Turbopack 解決）
scripts/seed.ts              # D1 ローカル (libsql file:./dev.db) へ 752件投入
package.json scripts          # dev:vinext/build:vinext/deploy:vinext + db:generate/migrate, pg/OpenNext 削除
next.config.ts               # images.remotePatterns のみ (serverExternalPackages 削除)
```

## DB — D1 実装詳細

`src/db/index.ts` は vinext 推奨の `cloudflare:workers` から `env.DB` を取得：

```ts
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import { cache } from "react";
import * as schema from "./schema";

function getD1BindingSync() {
  const cw = require("cloudflare:workers") as { env?: Record<string, unknown> };
  return cw?.env?.DB as D1Database | undefined;
}
export const getDb = cache(() => {
  const d1 = getD1BindingSync();
  if (!d1) throw new Error("D1 binding DB is not configured — use GeoJSON fallback");
  return drizzleD1(d1, { schema });
});
```

- `wrangler.jsonc` の `d1_databases: [{ binding: "DB", database_name: "urbex-hunter-db", database_id: "REPLACE_WITH_D1_ID" }]`
- ローカル `vite dev` は Miniflare が `wrangler.jsonc` の D1 を `env.DB` として提供（`--local` でも同様）
- 未設定/テストでは `hasDbAsync() === false` → GeoJSON フォールバック（`src/data/spots.json`）で完全動作
- マイグレーション: `drizzle-kit generate` → `drizzle/0000_*.sql` を `wrangler d1 execute` で適用（下記）

## ローカルで動かす

```bash
# 1. 依存関係
corepack enable
pnpm install

# 2. 環境変数（D1 は binding で渡るため DATABASE_URL は不要。GeoJSON フォールバックなら何も設定不要）
#    任意: .dev.vars / .env.local に NEXT_PUBLIC_* を設定（ビルド時インライン）

# 3. 型生成（任意）
pnpm run cf:typegen   # wrangler types --env-interface CloudflareEnv cloudflare-env.d.ts

# 4. 通常の Next 開発（HMR, GeoJSON フォールバック）
pnpm run dev          # http://localhost:3000

# 5. vinext + Workers 再現（本番に最も近い、D1 は Miniflare の --local DB）
pnpm run dev:vinext   # vite dev --port 3001 (wrangler.jsonc の D1 を自動 bind)
# またはビルドして wrangler で確認
pnpm run build:vinext # vite build → dist/server (RSC/SSR) + dist/client (assets) + dist/server/wrangler.json
pnpm run start:vinext # wrangler dev --config dist/server/wrangler.json

# 6. D1 ローカル DB を作成・投入（任意、GeoJSON だけでも動作）
pnpm exec wrangler d1 create urbex-hunter-db  # 初回のみ → 出力の database_id を wrangler.jsonc に貼り付け
pnpm exec wrangler d1 execute urbex-hunter-db --local --file=./drizzle/0000_eminent_natasha_romanoff.sql
pnpm run seed         # libsql file:./dev.db へ 752件投入（wrangler --local からも参照可能）
# 本番 D1 へ反映（database_id 設定後）
pnpm exec wrangler d1 execute urbex-hunter-db --remote --file=./drizzle/0000_eminent_natasha_romanoff.sql
```

## ビルドの検証（CI と同等）

```bash
pnpm run typecheck   # tsc --noEmit (0 errors)
pnpm run check       # biome check (1 warning any + 11 infos, no errors)
pnpm run build       # next build (Turbopack, 7/7 static)
pnpm run build:vinext # vite build (rsc 291 modules + client 613 + ssr 533, Build complete, Route / ISR 86400)
pnpm test            # vitest 37 passed (spots-repo 26 + scrape 11)
pnpm exec playwright test --list # 2 tests (任意)
```

`pnpm run build:vinext` の成果物：

```
dist/server/index.js              # Workers エントリ (RSC)
dist/server/_next/static/*        # RSC チャンク
dist/server/ssr/index.js          # SSR
dist/client/_next/static/*        # Client assets
dist/server/wrangler.json         # vinext が生成（wrangler deploy 用、wrangler.jsonc を継承）
dist/client/wrangler.json         # 同上（client 用）
```

## デプロイ（2つの方法）

### A. ローカルから `vinext-cloudflare deploy`（最も早い）

```bash
pnpm exec wrangler login

# D1 を作成（初回のみ）
pnpm exec wrangler d1 create urbex-hunter-db
# → wrangler.jsonc の d1_databases[0].database_id に貼り付け
pnpm exec wrangler d1 execute urbex-hunter-db --remote --file=./drizzle/0000_eminent_natasha_romanoff.sql
# （任意）dev.db の内容を D1 へコピーする場合は wrangler d1 のインポート/バッチを利用
# 例: sqlite dump → wrangler d1 execute --remote --file=./dump.sql

# ビルド & デプロイ
pnpm run build:vinext
pnpm run deploy:vinext   # vinext-cloudflare deploy --config dist/server/wrangler.json
# または dry-run
pnpm exec vinext-cloudflare deploy --config dist/server/wrangler.json --dry-run
```

`wrangler deploy` を直接使う場合：

```bash
pnpm run build:vinext
pnpm exec wrangler deploy --config dist/server/wrangler.json
```

### B. Workers Builds（GitHub 連携・自動デプロイ）— 推奨

1. Cloudflare ダッシュボード → Compute → Workers → Create → Import from GitHub → `shiratama644/urbex-hunter`
2. Build 設定:
   - **Build command**: `pnpm run build:vinext` （`vite build`）
   - **Deploy command**: （空 — Workers Builds が `wrangler deploy --config dist/server/wrangler.json` を自動実行。または `pnpm run deploy:vinext`）
   - **Environment variables**: `NEXT_PUBLIC_*` は **Vars** 兼 **Build Environment** に登録（Next はビルド時インライン）。`DB` (D1) は自動で binding されるため Secrets 不要。`DATABASE_URL` は使用しない（D1移行で削除）。
   - **Compatibility date**: `2026-10-02` 以上（`nodejs_compat` 必須）
3. 初回デプロイ後 `*.workers.dev` で確認 → カスタムドメインは Settings → Triggers → Add Custom Domain
4. D1 はダッシュボード → Storage → D1 → `urbex-hunter-db` を作成し `database_id` を `wrangler.jsonc` に反映（または `wrangler d1 create` の出力を手動設定）。マイグレーションは `wrangler d1 execute --remote --file` で適用済みであること。

> **重要**: Workers Builds の `process.env` は build-time と runtime が分離。`NEXT_PUBLIC_*` は **Build → Variables and Secrets** にも登録しないと `vite build` 時に空。

### C. GitHub Actions（任意）

```yaml
name: Deploy to Cloudflare Workers (vinext + D1)
on:
  push: { branches: [main] }
  workflow_dispatch:
jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 12.5.1 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build:vinext
        env:
          NEXT_PUBLIC_MAP_TILES: ${{ vars.NEXT_PUBLIC_MAP_TILES }}
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: deploy --config dist/server/wrangler.json
```

事前に `wrangler d1 create` / `wrangler d1 execute --remote --file` で D1 を用意しておくこと。

## 環境変数マトリクス

| 変数 | いつ inlined | どこに設定 | 備考 |
|---|---|---|---|
| `DB` (D1 binding) | ランタイム（`cloudflare:workers` env.DB） | `wrangler.jsonc` `d1_databases` + ダッシュボード D1 | 未設定なら GeoJSON フォールバック（推奨）。`REPLACE_WITH_D1_ID` を実際の `database_id` に置換。 |
| `NEXT_PUBLIC_*` | **ビルド時**（Vite/Next が静的置換） | `.env.local` / `.dev.vars` + **Workers Builds の Build Env** / `wrangler.jsonc` vars | `vite build` 実行前に `process.env` に存在する必要がある。ダッシュボードで Runtime のみ設定してもビルド時には空。 |
| `CLOUDFLARE_API_TOKEN` 等 | CI デプロイ時のみ | GitHub Secrets | `wrangler deploy` 用。 |

`DATABASE_URL` / `HYPERDRIVE` は D1 移行で廃止（`src/db/index.ts` は `cloudflare:workers` の `DB` のみ参照）。

## トラブルシューティング

- **`The provided Wrangler config main field (...) doesn't point to an existing file`** → `wrangler.jsonc` に OpenNext の `main: .open-next/worker.js` が残っている。vinext では `main` を削除し `assets.directory: dist/client` にすること（本リポジトリは修正済み）。
- **`failed to resolve import "pg-native" / "pg-cloudflare"`** → D1 移行で `pg` を削除済み。`vite.config.ts` の external は `cloudflare:workers` のみ。`pnpm install` 後に `pnpm run build:vinext` を再実行。
- **`[postcss] ENOENT: open 'tailwindcss'`** → `@tailwindcss/vite` が `vite.config.ts` に無い。先頭に `tailwindcss()` を追加済み。
- **`Failed to resolve import "cloudflare:workers"` (vitest)** → `vitest.config.ts` の alias が未設定。本リポジトリは `src/__mocks__/cloudflare-workers.ts` に解決済み。
- **`Unknown module type .geojson`** → `data/spots.geojson` を `src/data/spots.json` にコピーして `.json` で import（Vite/Turbopack は `.json` のみネイティブ）。`pnpm run scrape` 後に `cp data/spots.geojson src/data/spots.json` を忘れずに。
- **`compatibility_date` が古いと `process.env` が空** → `2026-10-02` に更新済み。
- **`export const runtime = 'edge'` があると vinext がエラー** → 本プロジェクトは未使用を確認。
- **`.open-next/worker.js not found` で `wrangler deploy` 失敗** → vinext では `dist/server/wrangler.json` を使う。`pnpm run build:vinext` 後に `pnpm run deploy:vinext` を実行すること。
- **画像が表示されない** → `next.config.ts` の `images.remotePatterns` は `ghostmap.jp` のみ許可。外部 `imageUrl` が別ドメインなら追加。Workers で最適化を無効化したい場合は `images: { unoptimized: true }`。
- **`drizzle-kit generate` で `0002_enable_pg_trgm.sql` が残る** → D1 では `pg_trgm`/`GIN` は不要。削除し `0000_*.sql` (SQLite) を生成済み。

## 次のステップ（オプション）

1. **R2 で ISR 永続化**: `wrangler r2 bucket create urbex-hunter-cache` → `vite.config.ts` / `wrangler.jsonc` で `assets` / `cache` を設定（vinext の `cache` オプション参照）。
2. **D1 を本番投入**: `wrangler d1 create` → `wrangler.jsonc` に `database_id` 設定 → `wrangler d1 execute --remote --file=./drizzle/0000_*.sql` → `pnpm run seed` の `dev.db` をバッチで投入（または `ensureSeeded()` の自動投入に任せる — 初回アクセス時に GeoJSON から D1 へ copy）。
3. **Tag cache**: `revalidateTag` を使う場合のみ `d1Databases` 追加 + `caching` 設定。
4. **カスタムドメイン**: Cloudflare ダッシュボード → Workers → Triggers → Custom Domains。

## 参考リンク

- vinext (Vite 版 Next.js): https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
- OpenNext (既存アプリ維持): https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/
- D1 (SQLite on Workers): https://developers.cloudflare.com/d1/
- drizzle-orm/d1: https://orm.drizzle.team/docs/get-started/sqlite-new#cloudflare-d1
- @tailwindcss/vite: https://tailwindcss.com/docs/installation/using-vite
- Cloudflare Workers `nodejs_compat`: https://developers.cloudflare.com/workers/configuration/compatibility-dates/
- vinext Cloudflare images: https://github.com/vinext/vinext
