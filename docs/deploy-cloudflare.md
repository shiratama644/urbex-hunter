# Cloudflare Workers デプロイガイド — urbex-hunter

> Next.js 16 (App Router) × Cloudflare Workers（`workerd` + `nodejs_compat`）× OpenNext Cloudflare Adapter  
> 本プロジェクト固有の注意点（`pg`/`fs`/`revalidate`/`images`）を完全に吸収した手順。  
> 元ドキュメント `docs/cf workersで公開するnextjsの注意点.md`（Perplexity生成、10章）を精読し反映済み。事実確認は `fetch_page`/`web_search` で実施。

## なぜ OpenNext か（vinextとの選択）

- Cloudflareは**新規 Next.js アプリには `vinext` を推奨**（`npx vinext check` → `vinext init` → `npm run build:vinext`）[1](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)、ただし**Beta** [1](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)。
- **`@opennextjs/cloudflare` は「既存の OpenNext アプリを維持する場合」に推奨**され、vinextへ移行できない互換性ギャップがある場合に使うパスとして公式に残されている [2](https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/)。[2](https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/) には `Use this guide to maintain an existing OpenNext application. Migrate to vinext when compatibility allows.` と明記。
- 本プロジェクトは Next.js 16 + Drizzle + scraping + `node:fs`/`pg` を含む既存アプリのため、**OpenNextを選択**（vinextへの移行は `npx vinext check` で互換性確認後に検討）。`@cloudflare/next-on-pages` は Edge専用・Next16非対応のため不使用。

## このリポジトリで実施した対応

| 課題（典型的な落とし穴） | 本リポジトリの対策 | ファイル |
|---|---|---|
| `runtime = 'edge'` を書くと OpenNext が非対応でビルド失敗 | **未使用を確認**（`grep runtime` で `edge` なし） | — |
| `node:fs`/`process.cwd()` で `data/spots.geojson` を読む → Workers は FS がない | `src/lib/spots-repo.ts` を **Workers フォールバック**化。`fs` は `dynamic import` で遅延、失敗時は `src/data/spots.json`（`data/spots.geojson` をバンドル時に `src/data/spots.json` へコピー、Turbopack は `.json` のみ解決）を静的 import で利用。ローカルは `fs` の mtime キャッシュ、Workers は埋め込みデータ。 | `src/lib/spots-repo.ts`, `src/data/spots.json` |
| `pg` (`drizzle-orm/node-postgres`) が `pg-native`/`pg-cloudflare` を `require` し esbuild で `Could not resolve` | `next.config.ts` に `serverExternalPackages: ["pg","pg-native","pg-cloudflare"]` で **external 化**（OpenNext の esbuild が解決しない）。`pg@8.20.0` + `pg-cloudflare@1.4.1` をインストール済み。Workers では既定で **GeoJSON フォールバック**（`DATABASE_URL` 未設定かつ Hyperdrive 未設定 → `hasDbAsync()===false`）なので DB なしでも完全動作。DB が必要な場合のみ Hyperdrive経由で `pg` がランタイム `require` される。`src/db/index.ts` は `getCloudflareContext().env.HYPERDRIVE.connectionString` を優先 [4](https://opennext.js.org/cloudflare/howtos/db)、`maxUses:1` で per-request Pool [4](https://opennext.js.org/cloudflare/howtos/db)。 | `next.config.ts`, `package.json`, `src/db/index.ts` |
| `process.env` が Workers では空（`compatibility_date` が古いと） | `wrangler.jsonc` の `compatibility_date: 2026-10-02` + `compatibility_flags: ["nodejs_compat"]` で `process.env` が自動 population。OpenNext が `env` → `process.env` にマッピング。`2026-10-02` は OpenNext公式の `Set this to today's date` に準拠 [2](https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/)。[3](https://developers.cloudflare.com/workers/databases/third-party-integrations/neon/) でも `compatibility_date: 2026-10-02` が例示。 | `wrangler.jsonc` |
| `revalidate = 86400` / `unstable_cache` が Workers ではメモリのみで永続化しない | `open-next.config.ts` で `defineCloudflareConfig({})` を用意。**本番で永続化したい場合は R2**：`import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache"` を `incrementalCache` に渡す。`wrangler.jsonc` に `r2_buckets` コメント済み。 | `open-next.config.ts`, `wrangler.jsonc` |
| 画像最適化 (`ghostmap.jp` の `imageUrl`) が `IMAGES` binding なしで失敗 | `next.config.ts` は `remotePatterns` のみ。OpenNext は `IMAGES` binding があれば **Cloudflare Images** で最適化、なければ `fetch` フォールバック。未設定でも動作。必要なら `wrangler.jsonc` に `images: { binding: "IMAGES" }` を追加。 | `next.config.ts`, `wrangler.jsonc` |
| `next dev` で `.dev.vars` が読まれない | `next.config.ts` で `initOpenNextCloudflareForDev()` を `import("@opennextjs/cloudflare").then(...)` で呼び出し（`ES2017` 互換のため top-level await を避けた dynamic import）。 | `next.config.ts` |
| `biome` が `src/data/spots.json` (911KB) を lint して失敗 | `biome.json` に `overrides: [{ includes: ["src/data/**","data/**"], linter: false, formatter: false }]` | `biome.json` |
| `pnpm: not found` で `opennextjs-cloudflare build` が失敗 | CI/ローカルで `corepack enable` または `corepack prepare pnpm@12.5.1 --activate` が必要。`packageManager: pnpm@12.5.1` を明記済み。 | `package.json`, `pnpm-lock.yaml` |

## セットアップ済みファイル

```
open-next.config.ts          # defineCloudflareConfig({}) — R2 追加はコメント参照
wrangler.jsonc               # name, main .open-next/worker.js, assets, services, compatibility_date 2026-10-02
next.config.ts               # serverExternalPackages + initOpenNextCloudflareForDev
src/data/spots.json          # data/spots.geojson のコピー（.json で Turbopack 解決）
src/lib/spots-repo.ts        # Workers フォールバック対応
public/_headers              # 静的 asset の Cache-Control
.dev.vars.example            # ローカル用サンプル（cp .dev.vars.example .dev.vars）
cloudflare-env.d.ts          # wrangler types 生成（gitignore 済み、要再生成）
biome.json / .gitignore      # .open-next/.wrangler/.dev.vars を ignore
package.json scripts          # preview/deploy/cf:* 追加
```

## DB — Hyperdrive 実装詳細（Neon）

`src/db/index.ts` は `getCloudflareContext().env.HYPERDRIVE.connectionString` を優先し、未設定なら `process.env.DATABASE_URL` にフォールバックする。OpenNext公式の Hyperdrive サンプルに準拠 [4](https://opennext.js.org/cloudflare/howtos/db)：

```ts
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export function getDb() {
  const { env } = getCloudflareContext();
  const cs = env.HYPERDRIVE.connectionString; // Hyperdrive推奨 [3](https://developers.cloudflare.com/workers/databases/third-party-integrations/neon/)
  const pool = new Pool({ connectionString: cs, maxUses: 1 }); // per-request [4](https://opennext.js.org/cloudflare/howtos/db)
  return drizzle({ client: pool });
}
export async function getDbAsync() {
  const { env } = await getCloudflareContext({ async: true }); // ISR/SSGでは async:true [4](https://opennext.js.org/cloudflare/howtos/db)
  const cs = env.HYPERDRIVE.connectionString;
  return drizzle(new Pool({ connectionString: cs, maxUses: 1 }));
}
```

- `pg@>=8.16.3` が必須 [3](https://developers.cloudflare.com/workers/databases/third-party-integrations/neon/)（本プロジェクトは `pg@8.20.0`）。
- `wrangler.jsonc` の `hyperdrive` は `localConnectionString` を併記し `wrangler dev --remote` なしでもローカルでDB接続可能 [5](https://neon.com/docs/guides/cloudflare-workers)。
- Neon側は**非プール接続文字列**を Hyperdrive に登録（`psql` の pooling off）し、Hyperdrive側で pooling を任せる [3](https://developers.cloudflare.com/workers/databases/third-party-integrations/neon/)。[6](https://neon.com/docs/guides/cloudflare-hyperdrive) では `wrangler hyperdrive create` で専用ロール `hyperdrive-user` を作成する手順が解説。
- `src/lib/spots-repo.ts` は `hasDbAsync()` で Hyperdrive 存在をランタイム判定し、未設定時は GeoJSON フォールバック（Workersでも完全動作）。
- リージョン: Neonが東京なら `wrangler.jsonc` の `placement: { mode: "smart" }` でレイテンシ削減（任意）[6](https://neon.com/docs/guides/cloudflare-hyperdrive)。

## ローカルで動かす

```bash
# 1. 依存関係
corepack enable
pnpm install

# 2. 環境変数（Workers ローカルは .dev.vars、Next は .env.local）
cp .dev.vars.example .dev.vars
cp .dev.vars .env.local
# DATABASE_URL を空にすれば GeoJSON フォールバックで即起動（推奨）
# 例: DATABASE_URL="" で 752件が表示される
# DB を使う場合: Neon/Supabase の URL を .dev.vars と .env.local 両方に記入

# 3. 型生成
pnpm run cf:typegen   # wrangler types --env-interface CloudflareEnv cloudflare-env.d.ts

# 4. 通常の Next 開発（HMR）
pnpm run dev          # http://localhost:3000

# 5. Workers 再現（本番に最も近い）
pnpm run preview      # opennextjs-cloudflare build && opennextjs-cloudflare preview
# または
pnpm run cf:build
pnpm exec wrangler dev --env="" # .dev.vars が読まれる

# 6. 静的ビルド検証
pnpm run build
pnpm run cf:build     # .open-next/worker.js が生成される
```

## ビルドの検証（CI と同等）

```bash
pnpm run typecheck   # tsc --noEmit
pnpm run ci          # biome ci
pnpm run build       # next build
pnpm run cf:build    # opennextjs-cloudflare build  # 成功を確認済み（2026-10-02: Worker saved in .open-next/worker.js）
pnpm run test        # vitest 37 passed
pnpm exec playwright test --list # 2 tests
```

## デプロイ（3つの方法）

### A. ローカルから `wrangler deploy`（最も早い）

```bash
# Cloudflare にログイン（初回のみ）
pnpm exec wrangler login

# （任意）R2 バケットを作成して ISR を永続化
pnpm exec wrangler r2 bucket create urbex-hunter-cache
# → wrangler.jsonc の r2_buckets コメントを外す

# （任意）Hyperdrive で Postgres を Workers から使う（DB が必要な場合）
pnpm exec wrangler hyperdrive create urbex-hunter-db --connection-string "$DATABASE_URL"
# → 出力された id を wrangler.jsonc の hyperdrive.id に貼り付け

# 環境変数を登録（ダッシュボードでも可）
echo "postgresql://..." | pnpm exec wrangler secret put DATABASE_URL
# または平文 var として:
# wrangler.jsonc の vars に追記するか、ダッシュボード > Workers > Settings > Variables

# デプロイ（build + deploy を一括）
pnpm run deploy
# 個別:
pnpm run cf:build
pnpm exec wrangler deploy
# プレビュー用（昇格せずにバージョンのみ）
pnpm exec wrangler deploy --preview
```

### B. Workers Builds（GitHub 連携・自動デプロイ）— 推奨

1. Cloudflare ダッシュボード → Compute → Workers → Create → Import from GitHub → `shiratama644/urbex-hunter` を選択
2. Build 設定:
   - **Build command**: `pnpm run cf:build` （内部で `pnpm build` 相当 + OpenNext 変換）
   - **Deploy command**: `npx wrangler deploy` または空（Workers Builds は自動で `wrangler deploy` 相当）
   - **Version command**: なし
   - **Environment variables**: `DATABASE_URL` は **Secrets**（暗号化）で登録。`NEXT_PUBLIC_*` は **Vars** 兼 **Build-time** に必要 → ダッシュボードの *Build Environment* にも同値を設定（Next はビルド時にインライン化）。
   - **Compatibility date**: `2026-10-02` 以上（`nodejs_compat` 必須）
3. 初回デプロイ後、表示された `*.workers.dev` で確認 → カスタムドメインは Settings → Triggers → Add Custom Domain

> **重要**: Workers Builds は `process.env` の *build-time* と *runtime* が分離。`NEXT_PUBLIC_*` や `DATABASE_URL` をビルド時に使うコード（`next.config.ts` の `images` は除く）は **Build → Variables and Secrets** にも登録しないと `next build` 時に空になる。OpenNext のドキュメントでも `NEXT_PUBLIC_` はビルド時インラインと明記。

### C. GitHub Actions（`wrangler deploy` を CI で）

`.github/workflows/deploy-cloudflare.yml`（本コミットで追加予定のサンプル）：

```yaml
name: Deploy to Cloudflare Workers
on:
  push:
    branches: [main]
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
      - run: pnpm run cf:build
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }} # あれば。なければ GeoJSON フォールバック
          NEXT_PUBLIC_MAP_TILES: ${{ vars.NEXT_PUBLIC_MAP_TILES }}
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: deploy
```

`CLOUDFLARE_API_TOKEN`（`Edit Cloudflare Workers` テンプレート）+ `CLOUDFLARE_ACCOUNT_ID` を GitHub Secrets に登録。

## 環境変数マトリクス

| 変数 | いつ inlined | どこに設定 | 備考 |
|---|---|---|---|
| `DATABASE_URL` / `HYPERDRIVE` | ランタイム（`hasDbAsync()` で分岐） | `.dev.vars` / `wrangler secret put` / ダッシュボード Secrets / `wrangler.jsonc` `hyperdrive` binding | 空なら GeoJSON フォールバック（Workers推奨）。Hyperdrive設定時は `src/db/index.ts` が `getCloudflareContext().env.HYPERDRIVE.connectionString` を優先 [4](https://opennext.js.org/cloudflare/howtos/db)（`localConnectionString` で `wrangler dev` でも接続 [5](https://neon.com/docs/guides/cloudflare-workers)）。`DATABASE_URL` はローカル/フォールバック用。 |
| `NEXT_PUBLIC_*` | **ビルド時**（Next が静的置換） | `.env.local` / `.dev.vars` + **Workers Builds の Build Env** / `wrangler.jsonc` vars | `opennextjs-cloudflare build` 実行前に `process.env` に存在する必要がある。ダッシュボードで *Runtime* のみ設定してもビルド時には空。 |
| `CLOUDFLARE_API_TOKEN` 等 | CI デプロイ時のみ | GitHub Secrets | — |

## トラブルシューティング（実査）

- **`pnpm: not found` / `workerd@1.20260930.2 ignored`** → `corepack enable && corepack prepare pnpm@12.5.1 --activate` または `npm i -g pnpm@12.5.1`。`workerd` の postinstall が `pnpm approve-builds` でブロックされた場合は `node node_modules/.pnpm/workerd@.../node_modules/workerd/install.js` を手動実行。
- **`Could not resolve "pg-native" / "pg-cloudflare"`** → `next.config.ts` の `serverExternalPackages` で解決済み。`pg@8.11.5` に下げても同様だが `serverExternalPackages` が根本解決。
- **`Unknown module type .geojson`** → `data/spots.geojson` を `src/data/spots.json` にコピーして `.json` で import（Turbopack は `.json` のみネイティブ）。`pnpm run scrape` 後に `cp data/spots.geojson src/data/spots.json` を忘れずに（`package.json` の `prebuild` にも追加可能）。
- **`compatibility_date` が古いと `process.env` が空** → `2025-04-01` 以降が必須。`2026-10-02` に更新済み。
- **`export const runtime = 'edge'` があると OpenNext がエラー** → 本プロジェクトは未使用を確認。
- **`.open-next/worker.js not found` で `wrangler deploy` 失敗** → `wrangler.jsonc` の `main: .open-next/worker.js` は `opennextjs-cloudflare build` 後に生成される。`pnpm run deploy` は build→deploy を一括で行うので順序を守る。Workers Builds では Build command を `pnpm run cf:build` にすること（`.open-next` は `.gitignore` なので GitHub に push しない）。
- **画像が表示されない** → `next.config.ts` の `images.remotePatterns` は `ghostmap.jp` のみ許可。外部 `imageUrl` が別ドメインなら追加。Workers で最適化を無効化したい場合は `images: { unoptimized: true }`。

## 次のステップ（オプション）

1. **R2 で ISR 永続化**: `wrangler r2 bucket create urbex-hunter-cache` → `open-next.config.ts` で `incrementalCache: r2IncrementalCache` を有効化 → `wrangler.jsonc` の `r2_buckets` をアンコメント。
2. **D1 で Tag Cache**: On-demand `revalidateTag` を使う場合のみ `d1NextTagCache` + `doQueue`。
3. **Hyperdrive で DB**: 本番で DB を使いたい場合、`pg` を Workers から直接 `DATABASE_URL` で触るより Hyperdrive 経由がレイテンシ・コネクション数で有利。
4. **カスタムドメイン**: Cloudflare ダッシュボード → Workers → Triggers → Custom Domains → `urbex-hunter.yourdomain.com`。

## 参考リンク

- [1] Neon + Hyperdrive 推奨: https://developers.cloudflare.com/workers/databases/third-party-integrations/neon/
- [2] OpenNext adapter（既存アプリ維持）: https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/
- [3] vinext推奨（新規）: https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
- [4] OpenNext DB (Hyperdrive): https://opennext.js.org/cloudflare/howtos/db
- [5] Neon Workers ガイド（localConnectionString）: https://neon.com/docs/guides/cloudflare-workers
- [6] Neon Hyperdrive ガイド: https://neon.com/docs/guides/cloudflare-hyperdrive
- OpenNext Cloudflare Adapter: https://opennext.js.org/cloudflare/get-started
- Cloudflare Workers `nodejs_compat`: https://developers.cloudflare.com/workers/configuration/compatibility-dates/
- `initOpenNextCloudflareForDev`: https://opennext.js.org/cloudflare/howtos/dev
- Caching (R2/D1): https://opennext.js.org/cloudflare/caching
