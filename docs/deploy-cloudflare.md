# Cloudflare Workers デプロイガイド — urbex-hunter

> Next.js 16 (App Router) × Cloudflare Workers（`workerd` + `nodejs_compat`）× OpenNext Cloudflare Adapter  
> 本プロジェクト固有の注意点（`pg`/`fs`/`revalidate`/`images`）を完全に吸収した手順。  
> 元ドキュメント「cf workersで公開するnextjsの注意点.md」が添付されていたがワークスペースに未到達のため、**標準の OpenNext 注意点を網羅**してセットアップ済み。該当 md を再アップロードいただければ差分を反映します。

## なぜ OpenNext か

- `Vercel` 以外で Next.js の SSR/ISR/RSC/`revalidate`/`fetch:cache` を正しく動かすにはビルド成果物を `workerd` 用に変換する必要がある。
- `@cloudflare/next-on-pages` は **Edge Runtime 専用**・**Next 16 非対応**・メンテナンスモード。`@opennextjs/cloudflare` は **Node Runtime + `nodejs_compat`** で既存コードをほぼ無改修で動かせる唯一の公式アダプタ。

## このリポジトリで実施した対応

| 課題（典型的な落とし穴） | 本リポジトリの対策 | ファイル |
|---|---|---|
| `runtime = 'edge'` を書くと OpenNext が非対応でビルド失敗 | **未使用を確認**（`grep runtime` で `edge` なし） | — |
| `node:fs`/`process.cwd()` で `data/spots.geojson` を読む → Workers は FS がない | `src/lib/spots-repo.ts` を **Workers フォールバック**化。`fs` は `dynamic import` で遅延、失敗時は `src/data/spots.json`（`data/spots.geojson` をバンドル時に `src/data/spots.json` へコピー、Turbopack は `.json` のみ解決）を静的 import で利用。ローカルは `fs` の mtime キャッシュ、Workers は埋め込みデータ。 | `src/lib/spots-repo.ts`, `src/data/spots.json` |
| `pg` (`drizzle-orm/node-postgres`) が `pg-native`/`pg-cloudflare` を `require` し esbuild で `Could not resolve` | `next.config.ts` に `serverExternalPackages: ["pg","pg-native","pg-cloudflare"]` で **external 化**（OpenNext の esbuild が解決しない）。`pg@8.20.0` + `pg-cloudflare@1.4.1` をインストール済み。Workers では既定で **GeoJSON フォールバック**（`DATABASE_URL` 未設定 → `isDbConfigured === false`）なので DB なしでも完全動作。DB が必要な場合のみ Hyperdrive 経由で `pg` がランタイム `require` される。 | `next.config.ts`, `package.json`, `src/db/index.ts` |
| `process.env` が Workers では空（`compatibility_date` が古いと） | `wrangler.jsonc` の `compatibility_date: 2025-09-01` + `compatibility_flags: ["nodejs_compat"]` で `process.env` が自動 population。OpenNext が `env` → `process.env` にマッピング。 | `wrangler.jsonc` |
| `revalidate = 86400` / `unstable_cache` が Workers ではメモリのみで永続化しない | `open-next.config.ts` で `defineCloudflareConfig({})` を用意。**本番で永続化したい場合は R2**：`import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache"` を `incrementalCache` に渡す。`wrangler.jsonc` に `r2_buckets` コメント済み。 | `open-next.config.ts`, `wrangler.jsonc` |
| 画像最適化 (`ghostmap.jp` の `imageUrl`) が `IMAGES` binding なしで失敗 | `next.config.ts` は `remotePatterns` のみ。OpenNext は `IMAGES` binding があれば **Cloudflare Images** で最適化、なければ `fetch` フォールバック。未設定でも動作。必要なら `wrangler.jsonc` に `images: { binding: "IMAGES" }` を追加。 | `next.config.ts`, `wrangler.jsonc` |
| `next dev` で `.dev.vars` が読まれない | `next.config.ts` で `initOpenNextCloudflareForDev()` を `import("@opennextjs/cloudflare").then(...)` で呼び出し（`ES2017` 互換のため top-level await を避けた dynamic import）。 | `next.config.ts` |
| `biome` が `src/data/spots.json` (911KB) を lint して失敗 | `biome.json` に `overrides: [{ includes: ["src/data/**","data/**"], linter: false, formatter: false }]` | `biome.json` |
| `pnpm: not found` で `opennextjs-cloudflare build` が失敗 | CI/ローカルで `corepack enable` または `corepack prepare pnpm@12.5.1 --activate` が必要。`packageManager: pnpm@12.5.1` を明記済み。 | `package.json`, `pnpm-lock.yaml` |

## セットアップ済みファイル

```
open-next.config.ts          # defineCloudflareConfig({}) — R2 追加はコメント参照
wrangler.jsonc               # name, main .open-next/worker.js, assets, services, compatibility_date 2025-09-01
next.config.ts               # serverExternalPackages + initOpenNextCloudflareForDev
src/data/spots.json          # data/spots.geojson のコピー（.json で Turbopack 解決）
src/lib/spots-repo.ts        # Workers フォールバック対応
public/_headers              # 静的 asset の Cache-Control
.dev.vars.example            # ローカル用サンプル（cp .dev.vars.example .dev.vars）
cloudflare-env.d.ts          # wrangler types 生成（gitignore 済み、要再生成）
biome.json / .gitignore      # .open-next/.wrangler/.dev.vars を ignore
package.json scripts          # preview/deploy/cf:* 追加
```

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
   - **Compatibility date**: `2025-09-01` 以上（`nodejs_compat` 必須）
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
| `DATABASE_URL` | ランタイム（`isDbConfigured` で分岐） | `.dev.vars` / `wrangler secret put` / ダッシュボード Secrets | 空なら GeoJSON フォールバック（Workers 推奨）。Hyperdrive を使う場合は `HYPERDRIVE` binding の `connectionString` を `src/db/index.ts` で `getCloudflareContext().env.HYPERDRIVE` から取得する拡張が必要（現状は `DATABASE_URL` を Hyperdrive の URL に上書きする運用でも可）。 |
| `NEXT_PUBLIC_*` | **ビルド時**（Next が静的置換） | `.env.local` / `.dev.vars` + **Workers Builds の Build Env** / `wrangler.jsonc` vars | `opennextjs-cloudflare build` 実行前に `process.env` に存在する必要がある。ダッシュボードで *Runtime* のみ設定してもビルド時には空。 |
| `CLOUDFLARE_API_TOKEN` 等 | CI デプロイ時のみ | GitHub Secrets | — |

## トラブルシューティング（実査）

- **`pnpm: not found` / `workerd@1.20260930.2 ignored`** → `corepack enable && corepack prepare pnpm@12.5.1 --activate` または `npm i -g pnpm@12.5.1`。`workerd` の postinstall が `pnpm approve-builds` でブロックされた場合は `node node_modules/.pnpm/workerd@.../node_modules/workerd/install.js` を手動実行。
- **`Could not resolve "pg-native" / "pg-cloudflare"`** → `next.config.ts` の `serverExternalPackages` で解決済み。`pg@8.11.5` に下げても同様だが `serverExternalPackages` が根本解決。
- **`Unknown module type .geojson`** → `data/spots.geojson` を `src/data/spots.json` にコピーして `.json` で import（Turbopack は `.json` のみネイティブ）。`pnpm run scrape` 後に `cp data/spots.geojson src/data/spots.json` を忘れずに（`package.json` の `prebuild` にも追加可能）。
- **`compatibility_date` が古いと `process.env` が空** → `2025-04-01` 以降が必須。`2025-09-01` に更新済み。
- **`export const runtime = 'edge'` があると OpenNext がエラー** → 本プロジェクトは未使用を確認。
- **`.open-next/worker.js not found` で `wrangler deploy` 失敗** → `wrangler.jsonc` の `main: .open-next/worker.js` は `opennextjs-cloudflare build` 後に生成される。`pnpm run deploy` は build→deploy を一括で行うので順序を守る。Workers Builds では Build command を `pnpm run cf:build` にすること（`.open-next` は `.gitignore` なので GitHub に push しない）。
- **画像が表示されない** → `next.config.ts` の `images.remotePatterns` は `ghostmap.jp` のみ許可。外部 `imageUrl` が別ドメインなら追加。Workers で最適化を無効化したい場合は `images: { unoptimized: true }`。

## 次のステップ（オプション）

1. **R2 で ISR 永続化**: `wrangler r2 bucket create urbex-hunter-cache` → `open-next.config.ts` で `incrementalCache: r2IncrementalCache` を有効化 → `wrangler.jsonc` の `r2_buckets` をアンコメント。
2. **D1 で Tag Cache**: On-demand `revalidateTag` を使う場合のみ `d1NextTagCache` + `doQueue`。
3. **Hyperdrive で DB**: 本番で DB を使いたい場合、`pg` を Workers から直接 `DATABASE_URL` で触るより Hyperdrive 経由がレイテンシ・コネクション数で有利。
4. **カスタムドメイン**: Cloudflare ダッシュボード → Workers → Triggers → Custom Domains → `urbex-hunter.yourdomain.com`。

## 参考リンク

- OpenNext Cloudflare Adapter: https://opennext.js.org/cloudflare/get-started
- Cloudflare Workers `nodejs_compat`: https://developers.cloudflare.com/workers/configuration/compatibility-dates/
- `initOpenNextCloudflareForDev`: https://opennext.js.org/cloudflare/howtos/dev
- Caching (R2/D1): https://opennext.js.org/cloudflare/caching
