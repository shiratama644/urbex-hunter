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

## ADR-005: パッケージ管理は npm

zip 由来の npm（`npm ci`）を維持する。bun / yarn / pnpm への置換はしない。`package-lock.json` が無い期間は `npm install` で生成する。

## ADR-006: Lint は ESLint flat config

`eslint.config.mjs` で `eslint-config-next/core-web-vitals` + `globalIgnores` を使う。Biome / Prettier を混在させない。

## ADR-007: データのソース・オブ・トゥルースは ghostmap.jp 由来の GeoJSON + DB

`data/spots.geojson`（752件）を Git 追跡し、DB が空なら `ensureSeeded()` が GeoJSON から自動投入する。DB のみを正本にしない（Sandbox で DB 無しでも動作するため）。

## ADR-008: API キャッシュは 1日

`GET /api/spots` と `page.tsx` は `revalidate = 86400` + `s-maxage=86400`。データ更新が週次のため十分。期間変更は ADR で合意してから。

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

## 実装時まで持ち越す未決

| # | 事項 |
|---|---|
| A | お気に入り・認証・ランキングの要否と方式 |
| B | `facets` のキャッシュ戦略（ISR vs メモ化 vs 定期集計） |
| C | Playwright E2E の導入要否と範囲 |
| D | タイルプロバイダの長期選択（CartoDB 以外の検討） |

これらに到達したら人間に聞く。
