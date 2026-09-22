---
name: project-overview
description: プロダクトの全体像（目標・現行コードと理想形・フェーズ進捗）を掴む。新規セッションの最初に読む 1 スキル。
---

# Project Overview — urbex-hunter

> 製品の全体像。新規セッションの最初に読む 1 ファイル。
> 仕様の正本は [`../../../docs/arch/product.md`](../../../docs/arch/product.md)。
> 進捗の正本は [`../../../docs/task-list.md`](../../../docs/task-list.md)。

## 製品

**urbex-hunter（全国心霊マップ Explorer 👻）** は、「全国心霊マップ (ghostmap.jp)」由来の心霊スポットデータ（752件 / 47都道府県）を、**Material 3 Expressive** の地図 UI で探索する非公式ファンプロジェクト。

- **データ**: `data/spots.geojson`（FeatureCollection / `spotcd` 主キー）+ PostgreSQL（`spots` テーブル / Drizzle ORM）。DB が空なら `ensureSeeded()` が GeoJSON から自動投入（アドバイザリロックで多重実行防止）。
- **地図**: Leaflet + react-leaflet + leaflet.markercluster（CartoDB Dark Matter ⇄ Positron 切替）。全画面 `h-dvh`、FAB（現在地 / スタイル切替）、フローティング Search Bar、フィルターチップ＋シート。
- **UI**: `GhostMapApp`（シェル / 状態親） + `MapClient`（dynamic ssr:false） + `SpotDetailSheet`（Bottom Sheet / サイドパネル） + `FilterPanel` + `DisclaimerDialog`（初回免責同意 / LocalStorage）。
- **API**: `GET /api/spots`（bbox/genre/pref/phenomenon/min_rating/q/limit / GeoJSON / `revalidate 86400` + `s-maxage`）、`GET /api/spots/[id]`（詳細＋近隣4件）、`GET /api/facets`（集計）、`GET /api/health`。
- **収集**: `scripts/scrape.ts`（cheerio / `PREFS` / `LIMIT_PER_PREF` / `CONCURRENCY` / `?q=lat,lng` 正規表現抽出）→ `scripts/seed.ts` → `drizzle-kit push`。週次は `.github/workflows/scrape_update.yml`（cron `15 18 * * 0` = JST 月曜 03:15）。
- **非公式・免責必須**：データ著作権は全国心霊マップに帰属。私有地侵入禁止・近隣配慮・自己責任を `DisclaimerDialog` と docs で明示する。

現行コードは **`nextjs-ghost-map-application.zip` からの展開直後**（単一 Next.js パッケージ / bun ではなく npm）。本リポジトリの理想アーキテクチャは `docs/arch/` に整理する。

## 技術スタック（要点）

| 層 | 使うもの | 使わない / 注意 |
| :--- | :--- | :--- |
| ビルド | Next.js 16 App Router + React 19 + TypeScript 5 (strict) | `tailwind.config.ts` を作らない（Tailwind v4 は CSS-first） |
| スタイル | Tailwind CSS v4 (`@theme` in `src/app/globals.css`) + PostCSS `@tailwindcss/postcss` | 旧 v3 の config へ戻さない。M3 トークンを勝手にリネームしない |
| 地図 | Leaflet 1.9 + react-leaflet 5 + leaflet.markercluster (CartoDB) | 地図コンポーネントを SSR しない。`dynamic ssr:false` を維持 |
| アニメーション | framer-motion（M3 emphasized/spatial easing） | 地図操作を妨げる過剰 motion を入れない |
| DB | PostgreSQL + Drizzle ORM 0.45 + pg + drizzle-kit | Prisma に置き換えない。`spots` スキーマが正本 |
| スクレイパー | cheerio + tsx | スクリプト経路以外で ghostmap.jp にアクセスしない |
| Lint | ESLint 9 flat config (`eslint-config-next/core-web-vitals`) | Biome / Prettier を混在させない |
| パッケージ | npm (`npm ci` / `npm run`) | bun / yarn / pnpm に置き換えない（zip 由来は npm） |

詳細なハマりどころは [`tech-stack/SKILL.md`](../tech-stack/SKILL.md)。設計ルールは [`../../../docs/arch/adr.md`](../../../docs/arch/adr.md)。

## リポジトリ構成（zip 展開後）

```
.
├── data/spots.geojson            # 752件 / 47都道府県（ソース・オブ・トゥルース補助）
├── scripts/scrape.ts             # ghostmap.jp スクレイパー（cheerio）
├── scripts/seed.ts               # GeoJSON → PostgreSQL upsert
├── .github/workflows/scrape_update.yml # 週次更新
├── src/
│   ├── app/
│   │   ├── globals.css           # ★ M3 トークン @theme
│   │   ├── layout.tsx / page.tsx # Server Component で querySpots/getFacets
│   │   └── api/{spots,facets,health}/route.ts
│   ├── components/
│   │   ├── Map/MapClient.tsx     # Leaflet dynamic / markercluster
│   │   ├── GhostMapApp.tsx       # シェル（Search / Filter / FAB）
│   │   ├── SpotDetailSheet.tsx   # Bottom Sheet / サイドパネル
│   │   ├── FilterPanel.tsx
│   │   └── DisclaimerDialog.tsx
│   ├── db/{index.ts,schema.ts}   # Drizzle spots table
│   └── lib/{types.ts,spots-repo.ts}
├── docs/                         # ← 本タスクで cod-web 型の索引・arch・planning を導入
└── .agent/                       # ← Agent スキル・フック・ログ
```

## フェーズ進捗（雛形）

> 正本は [`../../../docs/task-list.md`](../../../docs/task-list.md)。下表は要点のみ。

| Phase | 内容 | 状態 |
| :--- | :--- | :--- |
| **0** | zip 展開・AGENTS/.agent/docs 導入・ビルド疎通 | 本タスクで実施 |
| **1** | 地図の堅牢化（bbox クランプ・クラスタ閾値・SSR 分離・a11y） | 未着手 |
| **2** | API / DB 強化（facet キャッシュ・近隣距離・seed 冪等・index 検証） | 未着手 |
| **3** | スクレイパー強化（リトライ・差分・重複排除・ポライトネス） | 未着手 |
| **4** | UI 磨き（M3 トークン整理・motion 予算・フィルタ永続化） | 未着手 |
| **5** | 運用 / 品質（E2E・監視・weekly workflow の可観測性） | 未着手 |

## 関連

- 開発規約: [`../../../AGENTS.md`](../../../AGENTS.md)
- 仕様入口: [`../../../docs/arch/README.md`](../../../docs/arch/README.md)
- タスク正本: [`../../../docs/task-list.md`](../../../docs/task-list.md)
- 起動: `npm ci && npm run dev`（`http://localhost:3000`）、`npm run build`、`npm run typecheck`、`npm run lint`
