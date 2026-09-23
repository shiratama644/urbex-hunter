# 意思決定ログ（ADR） — urbex-hunter

実装中に覆したくなったら **実装せず人間へ確認**する。

## ADR-001: フレームワークは Next.js 16 App Router

`nextjs-postgresql-template` 由来の Next.js を維持する。Vite / Remix 等への置換はしない。App Router の Server Component / ISR を活用する。

## ADR-002: スタイリングは Tailwind CSS v4 (CSS-first)

`tailwind.config.ts` は作らず、`src/app/globals.css` の `@theme` に M3 トークンを集約する。PostCSS は `@tailwindcss/postcss` のみ。旧 v3 config への回帰はしない。

## ADR-003: 地図は Leaflet + react-leaflet + markercluster

CartoDB（Dark Matter / Positron）をタイルに使う。MapLibre / Google Maps への置換は ADR で合意してから。Leaflet は `dynamic ssr:false` で分離する。

## ADR-004: DB は PostgreSQL + Drizzle ORM

Prisma / TypeORM への置換はしない。スキーマは `src/db/schema.ts` が正本。`spots.spotcd` を PK とし、冪等 upsert を維持する。

## ADR-005: パッケージ管理は pnpm

EM1-A で `npm` から `pnpm 12.5.1` へ移行した。`packageManager: pnpm@12.5.1` / `pnpm-lock.yaml` / `pnpm-workspace.yaml`（`allowBuilds: { esbuild: true, sharp: true }`）で再現性を担保する。`npm ci` は使わない。事実: pnpm は content-addressable store + hard links で 50–70% 節約・strict 依存解決で phantom をブロック [1](https://www.13labs.au/compare/pnpm-vs-npm)。

## ADR-006: Lint/Format は Biome 2.x

EM1-A で ESLint → **Biome 2.5.x** へ移行した。`biome.json`（`$schema: 2.5.14` / `domains: next,react,project` / `css.parser.tailwindDirectives: true`）で format + lint + organizeImports を一元化する。Next 16 は `next lint` を廃止したため公式推奨の移行先 [1](https://biomejs.dev/blog/biome-v2-0-beta/)。Prettier / ESLint は混在させない。

## ADR-007: データのソース・オブ・トゥルースは ghostmap.jp 由来の GeoJSON + DB

`data/spots.geojson`（752件）を Git 追跡し、DB が空なら `ensureSeeded()` が GeoJSON から自動投入する。DB のみを正本にしない（Sandbox で DB 無しでも動作するため）。

## ADR-008: API / ページのキャッシュ

- `GET /api/spots` / `page.tsx` は `revalidate = 86400` + `s-maxage=86400, stale-while-revalidate=604800`（1日再検証、週は stale 許容）。
- `GET /api/facets` と `getFacets()` は **1時間 cache**（`unstable_cache` + `tags: ['facets']` + `revalidate: 3600`）。`page.tsx` が `getFacets` を呼ぶため、**最も小さい revalidate（3600）がページ全体の ISR に反映され 1h で再検証**される（Next の 4層キャッシュで最小が勝つ事実 [1](https://nextjs.org/docs/app/guides/caching-without-cache-components)）。データ更新が週次のため十分。期間変更は ADR で合意してから。
- 将来 `revalidateTag('facets')` でオンデマンド無効化（`scripts/seed.ts` 後の webhook）も可能。

## ADR-009: スクレイピングのポライトネス

同時接続既定6、UA `GhostMapStudyBot`、待機、既存 GeoJSON とマージ、`PREFS` / `LIMIT_PER_PREF` での絞り込みを維持する。ポライトネスを弱める変更は禁止。

## ADR-010: 対象は ghostmap.jp のみ

他サイトへのスクレイピング拡張は ADR で合意してから。無断で対象を増やさない。

## ADR-011: 免責は必須表示

`DisclaimerDialog`（初回 LocalStorage 同意）+ フッター等で私有地侵入禁止・近隣配慮・自己責任を明示する。文言を削除・弱体化しない。

## ADR-012: ライセンスは MIT

確定。`LICENSE` が正本。

## ADR-013: bbox 絞り込みは zoom >= 8 の時のみ

`GhostMapApp` が `zoom >= 8` の時のみ `bbox` を `GET /api/spots` に送る。広域での絞り込みはちらつき・負荷の原因になるため。閾値変更は ADR で合意してから。

## ADR-014: 地図の Server/Client 境界

`page.tsx`（Server）が `querySpots` / `getFacets` を取得し、`GhostMapApp`（Client）が状態親、`MapClient`（Client ssr:false）が描画という境界を維持する。Client から DB 直結しない。

## ADR-015: 単一パッケージを維持

当面 monorepo（`packages/` 分割）はしない。分割が必要になったら ADR で合意してから。

## ADR-016: 初期表示の件数と怖さ閾値の統一

- 初期表示は `page.tsx` で `querySpots({ limit: 500 })`（was 2000 → 500 に縮小）。1500 件の全再構築はモバイルで jank するため、500 で初回を軽くし、bbox 移動で追加取得する（ADR）。
- 怖さ評価の閾値は `fearTone` と `RATINGS` を **3.0 / 3.6 / 4.2** で統一（was `RATINGS: 3.5/4.3`）。`fearTone` の 4.2/3.6/3.0 に合わせた。

## ADR-017: スクレイピングの抽出堅牢化（EM1-C）

- 緯度経度は `maps?q=lat,lng` / `"latitude":` JSON / `data-lat/data-lng` の 3パターンで取得。
- `th` は前方一致（`startsWith("読み方")`）で `読み方（かな）` 等の括弧付き変化に対応。
- `imageUrl` は `https` 強制 + `og:image` fallback。
- `num` は全角 `０-９` を半角化、`outline` / `comment` は `cleanMultiline` で改行保持。

## 実装時まで持ち越す未決

| # | 事項 |
|---|---|
| A | お気に入り・認証・ランキングの要否と方式 |
| B | `facets` のキャッシュ戦略（ISR vs メモ化 vs 定期集計）→ EM1-B で `unstable_cache` + 1h に確定 |
| C | Playwright E2E の導入要否と範囲 |
| D | タイルプロバイダの長期選択（CartoDB 以外の検討） |

これらに到達したら人間に聞く。
