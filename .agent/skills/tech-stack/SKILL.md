---
name: tech-stack
description: Next.js / Tailwind v4 / Leaflet / Drizzle の使いどころ・ハマりどころ。実装時に参照。仕様の正本は docs/arch。
---

# Tech Stack Skill — 技術構成を使いこなす

> **スキル**: 「どのライブラリをどこでどう使うか」と、このリポジトリで既に分かっている地雷。
> 設計の正本は [`../../../docs/arch/`](../../../docs/arch/README.md)（特に architecture / data-model / api / ui / scraping）。
> `tailwind.config.ts` は作らない（v4 の CSS-first が正）。

新規コードは **理想列**に従う。zip 展開直後のコードを壊さない範囲で段階的に改善する。ghostmap.jp 以外へのスクレイピング拡張は ADR 合意が必要。

## 理想（これから）

| 層 | 使うもの | 使わない / 禁止 |
| :--- | :--- | :--- |
| ランタイム | Node 22 + npm（`npm ci` / `npm run` / `npx`） | bun / yarn / pnpm への置換。`bun.lock` を持ち込まない |
| フレームワーク | Next.js 16 App Router + React 19 + TypeScript strict | Pages Router への回帰。`src/` 外へのコード分散 |
| スタイル | Tailwind v4 + `@theme`（`src/app/globals.css`） + `@tailwindcss/postcss` | `tailwind.config.ts` 新設。M3 トークンの勝手リネーム |
| 地図 | Leaflet 1.9 + react-leaflet 5 + leaflet.markercluster（CartoDB） | 地図を SSR する。`MapClient` 以外で Leaflet を直接 import して SSR 破壊 |
| アニメーション | framer-motion（M3 easing） | 地図 pan/zoom を妨げる長時間 motion |
| DB | PostgreSQL + Drizzle ORM 0.45 + `pg` + `drizzle-kit` | Prisma / TypeORM への置換。`spots` 以外への無計画な table 追加（ADR が必要） |
| スクレイパー | cheerio + `tsx`（`scripts/*.ts`） | スクリプト外からの ghostmap.jp fetch。UA 無しの大量リクエスト |
| Lint | ESLint 9 flat config (`eslint-config-next/core-web-vitals`) | Biome / Prettier の混在。`files.includes` 的除外 |

レートは **UI=可変 rAF相当（地図操作） / API=ISR 86400 + s-maxage 86400**。スクレイパーは週次（cron）のみ全量。

## ツールチェーン（zip 由来）

| 用途 | 技術 | コマンド |
| :--- | :--- | :--- |
| Dev | Next.js | `npm run dev` → `http://localhost:3000` |
| Build | Next.js | `npm run build`（`.next/`） |
| Typecheck | TypeScript | `npm run typecheck` (`tsc --noEmit`) |
| Lint | ESLint | `npm run lint` (`eslint .`) |
| DB migrate | drizzle-kit | `npx drizzle-kit push`（`drizzle.config.json` 参照） |
| Seed | tsx | `npx tsx scripts/seed.ts` |
| Scrape | tsx + cheerio | `npx tsx scripts/scrape.ts`（`PREFS` / `LIMIT_PER_PREF` / `CONCURRENCY`） |
| パッケージ | npm | `npm ci`（lock が無い期間は `npm install`） |

## ハマりどころ（本リポジトリで確認済み）

### Tailwind v4
- `tailwind.config.ts` を作ると v4 の CSS-first と競合する。トークンは **`src/app/globals.css` の `@theme`** に集約する。
  ```css
  @import "tailwindcss";
  @theme {
    --color-m3-primary: #d0bcff;
    --radius-m3-xl: 28px;
    /* ... */
  }
  ```
- `postcss.config.mjs` は `{"@tailwindcss/postcss": {}}` のみ。`tailwindcss` 本体を plugins に書かない（v4 の postcss ラッパーが必要）。
- トークンは `bg-m3-surface` / `rounded-m3-xl` / `shadow-m3-3` のように Tailwind ユーティリティとして自動生成される。`--color-m3-*` を消すと大量のクラスが un-resolved になる。

### Next.js / React
- `src/app/page.tsx` は **Server Component**（`revalidate = 86400`）。ここで `querySpots` / `getFacets` を `Promise.all` する。
- `MapClient` は **必ず `dynamic(..., { ssr:false })`**。Leaflet は `window` 前提のため SSR すると `ReferenceError: window is not defined`。
- `GhostMapApp` は Client Component（`"use client"`）。地図操作状態（bbox/zoom/tile/query/selected）と API 取得をここで orchestrate するが、地図描画自体は `MapClient` に委譲する。
- `layout.tsx` の `viewport` は `themeColor: "#121016"`（M3 surface-dim）。`maximumScale: 1` を外すと地図のピンチ挙動が変わる。

### Leaflet / markercluster
- `leaflet` と `leaflet.markercluster` は CSS を別途 import する必要がある（`MapClient` 内で `import "leaflet/dist/leaflet.css"` 等）。忘れるとマーカーが崩れる。
- CartoDB タイルは `https://{s}.basemaps.cartocdn.com/{dark_all|light_all}/{z}/{x}/{y}{r}.png`。Dark Matter と Positron を `tile` state で切り替える。
- クラスタリングは `L.markerClusterGroup`。アイコン生成で怖さ評価（`fearRating`）を見て色を分ける際は、閾値が `src/lib/types.ts` の `fearTone` と一致しているか確認する。
- `bbox` 絞り込みは **zoom >= 8 の時のみ**有効（`GhostMapApp`）。広域で bbox を送ると API 負荷とちらつきの原因になる。pad 0.15 の拡張も維持する。
- ライブプレビュー（e2b.app）では `next dev --hostname 0.0.0.0` のように `0.0.0.0` で公開し、`allowedHosts` 的な制限を入れない（Next.js 15+ では `experimental.allowedHosts` ではなく `async headers` で制御）。

### Drizzle / DB
- `drizzle.config.json` の `dialect: postgresql` / `schema: ./src/db/schema.ts` / `dbCredentials.url` を壊さない。`DATABASE_URL` 環境変数があれば `db/index.ts` がそちらを優先する。
- `spots` テーブルは `spotcd` PK。`phenomena` / `features` は `text[]`。index は `prefecture` / `genre` / `(lat,lng)`。追加 index は `docs/arch/data-model.md` で合意してから。
- `ensureSeeded()` の多重実行防止は **advisory lock**（`pg_try_advisory_lock`）。`tableReady()` が false の時は `createTableIfMissing()` で DDL する。Sandbox で DB 無しなら GeoJSON 直読みにフォールバックする。
- `querySpots` の `bbox` は `[minLng, minLat, maxLng, maxLat]`。緯度経度の順序を逆にしない。`parseBbox` が `undefined` を返したら全件側に倒す（500 にしない）。
- `getFacets()` は genres / prefectures / phenomena の件数を集計。毎リクエストで `COUNT(*)` するため、将来は ISR やメモ化を `docs/arch/api.md` で設計してから入れる。

### スクレイピング
- `scripts/scrape.ts` は `PREFECTURES` 配列（47件）をループ。`BASE=https://ghostmap.jp` / UA=`GhostMapStudyBot` を維持する。UA を消すとブロックされやすくなる。
- 座標は「Googleマップを開く」リンクの `?q=lat,lng` を **正規表現**で抽出する。リンク形式が変わった場合は `scripts/scrape.ts` の regex と `docs/arch/scraping.md` を同時に更新する。
- 出力は `data/spots.geojson`（FeatureCollection / `count`）。**既存ファイルとマージ**する（単純上書きしない）。`spotcd` 重複は上書きで最新を優先する。
- 環境変数:
  - `PREFS=13,27` — 対象都道府県コードの絞り込み（デバッグ時に `PREFS=13 LIMIT_PER_PREF=5` で少量検証）。
  - `LIMIT_PER_PREF=16` — 1県あたり件数（既定16）。大量に上げると相手サーバー負荷と実行時間（45分 timeout）が増える。
  - `CONCURRENCY=6` — 同時接続。6 を超える場合は `docs/arch/scraping.md` のポライトネス節を更新して ADR する。
- `scrape_update.yml` の `timeout-minutes: 45` / `contents: write` / `git push` を壊さない。差分が無い時は commit しない分岐を維持する。

### ESLint
- `eslint.config.mjs` は `defineConfig([...nextCoreWebVitals, globalIgnores([...])])`。`globalIgnores` の対象が `files` ではなく `ignores` であることに注意。
- `next-env.d.ts` は生成物。lint 除外に入れる。

## API を記憶で書かない

Next.js / Leaflet / Drizzle は公式ドキュメントを検索する（AGENTS.md §7.5）。存在しないオプションを発明しない。
`drizzle.config.json` の `dialect` は `postgresql`（`postgres` ではない）。`leaflet.markercluster` の import パスは `leaflet.markercluster`（ハイフンではなくドット）。
