# 全国心霊マップ Explorer 👻 — urbex-hunter

「全国心霊マップ (https://ghostmap.jp/)」から収集した心霊スポットデータを、
**Next.js 16 (App Router) + API Routes + PostgreSQL(Drizzle) + Tailwind CSS v4 (Material 3 Expressive) + Leaflet(CartoDB / クラスタリング)**
で探索できる非公式マップアプリです。

**仕様正本:** [`docs/arch/`](docs/arch/README.md)（入口 [`docs/arch/product.md`](docs/arch/product.md)）
**進捗正本:** [`docs/task-list.md`](docs/task-list.md)
**計画書入口:** [`docs/planning/`](docs/planning/README.md)（次は [`docs/planning/HANDOFF.md`](docs/planning/HANDOFF.md)）
**作業規約:** [`AGENTS.md`](AGENTS.md)（Agent 必読）
**法務・免責:** [`docs/arch/legal.md`](docs/arch/legal.md)

現行コードは `nextjs-ghost-map-application.zip` からの展開直後（単一 Next.js パッケージ / npm）。ライセンスは **MIT**（[`LICENSE`](LICENSE)）。

## 起動

```bash
npm ci
npm run dev              # http://localhost:3000
npm run typecheck        # tsc --noEmit
npm run lint             # eslint .
npm run build            # next build
# DB がある場合
npx drizzle-kit push     # スキーマ適用
npx tsx scripts/seed.ts  # GeoJSON → PostgreSQL
```

地図は Leaflet（`MapClient` は `dynamic ssr:false`）。DB が無い環境でも `data/spots.geojson` から `ensureSeeded()` が自動投入するため、地図は表示されます（[`docs/arch/data-model.md`](docs/arch/data-model.md)）。

## 1. プロジェクト構成

```
.
├── data/
│   └── spots.geojson            # スクレイピング結果 (752件 / 47都道府県)
├── scripts/
│   ├── scrape.ts                # ghostmap.jp スクレイパー (cheerio)
│   └── seed.ts                  # GeoJSON → PostgreSQL 取り込み
├── .github/workflows/
│   └── scrape_update.yml        # 週次自動更新 (GitHub Actions)
├── src/
│   ├── app/
│   │   ├── globals.css          # ★ M3 Expressive デザイントークン (@theme)
│   │   ├── layout.tsx
│   │   ├── page.tsx             # 全画面地図ビュー (Server Component)
│   │   └── api/
│   │       ├── spots/route.ts        # GET /api/spots (bbox/genre/pref/min_rating/q)
│   │       ├── spots/[id]/route.ts   # GET /api/spots/:spotcd (+近隣スポット)
│   │       ├── facets/route.ts       # ジャンル・都道府県・心霊現象の集計
│   │       └── health/route.ts
│   ├── components/
│   │   ├── Map/MapClient.tsx    # Leaflet (dynamic import / ssr:false) + markercluster
│   │   ├── GhostMapApp.tsx      # 検索バー・フィルターチップ・FAB を含むシェル
│   │   ├── SpotDetailSheet.tsx  # M3 Bottom Sheet / デスクトップはサイドパネル
│   │   ├── FilterPanel.tsx      # M3 フィルターシート
│   │   └── DisclaimerDialog.tsx # 初回訪問時の免責同意ダイアログ (LocalStorage)
│   ├── db/{index.ts,schema.ts}  # Drizzle (spots テーブル)
│   └── lib/{types.ts,spots-repo.ts}
├── docs/
│   ├── arch/                    # 仕様書（product/architecture/data-model/api/ui/scraping/adr/legal）
│   ├── planning/                # 計画書（_TEMPLATE / HANDOFF）
│   ├── task-list.md             # 進捗の唯一の正本
│   └── ops/                     # CI / quality gate 提案
└── .agent/
    ├── skills/                  # Agent スキル（project-overview / tech-stack / sandbox-constraints）
    ├── hooks/                   # 定型ワークフロー（pre-task / verify / log / recovery）
    └── logs/                    # タスク実行記録
```

### デザイントークンについて

Tailwind CSS **v4** を採用しているため、`tailwind.config.ts` ではなく
`src/app/globals.css` の `@theme` ブロックで M3 Expressive トークンを定義しています
（v4 の CSS-first 設定。`--color-m3-*`, `--radius-m3-*`, `--text-display-*`,
`--shadow-m3-*`, `--ease-m3-*` が Tailwind ユーティリティとして自動生成されます）。

- Tonal palettes: Primary / Secondary / Tertiary / Error / Surface Container 5段階
- Shape: `rounded-m3-lg` 〜 `rounded-m3-xxl`、ピル型 `rounded-m3-full`
- Type scale: `text-display-*`, `text-headline-*`, `text-title-*`, `text-body-*`, `text-label-*`
- Elevation: `shadow-m3-1` 〜 `shadow-m3-5`
- Motion: Framer Motion のスプリング + `--ease-m3-emphasized/spatial`

詳細は [`docs/arch/ui.md`](docs/arch/ui.md)。

## 2. データ収集

```bash
npx tsx scripts/scrape.ts                   # 全47都道府県 × 16件
LIMIT_PER_PREF=30 npx tsx scripts/scrape.ts # 件数を増やす
PREFS=13,27 npx tsx scripts/scrape.ts       # 東京・大阪のみ
```

抽出項目: `spotcd` / スポット名 / 読み仮名 / 住所・都道府県・市区町村 /
緯度経度（「Googleマップを開く」リンクの `?q=lat,lng` を正規表現で抽出）/
ジャンル / 状態 / 心霊現象 / 特徴タグ / 総合得点 / 全国ランク / 県別ランク /
怖さ評価(5段階) / 評価人数 / 概要 / 代表コメント / 画像URL / 元記事URL。

出力は `data/spots.geojson`（FeatureCollection）。既存ファイルとマージするため、
複数回に分けた実行でもデータが蓄積されます。

DB への取り込み:

```bash
npx drizzle-kit push        # スキーマ適用
npx tsx scripts/seed.ts     # GeoJSON を upsert
```

API 初回アクセス時にテーブルが空であれば、`ensureSeeded()` が
`data/spots.geojson` から自動でシードします（アドバイザリロックで多重実行を防止）。

詳細は [`docs/arch/scraping.md`](docs/arch/scraping.md) と [`docs/arch/data-model.md`](docs/arch/data-model.md)。

## 3. API

| Endpoint | 説明 |
| --- | --- |
| `GET /api/spots` | `bbox=minLng,minLat,maxLng,maxLat` / `genre` / `pref` / `phenomenon` / `min_rating` / `q` / `limit`。GeoJSON FeatureCollection を返す。`revalidate = 86400` + `s-maxage` |
| `GET /api/spots/[id]` | スポット詳細 + 近隣4件 |
| `GET /api/facets` | ジャンル・都道府県・心霊現象の件数集計（フィルタUI用） |
| `GET /api/health` | ヘルスチェック |

詳細は [`docs/arch/api.md`](docs/arch/api.md)。

## 4. UI/UX

- 全画面 Leaflet マップ（CartoDB Dark Matter ⇄ Positron 切替）
- `leaflet.markercluster` による Expressive なクラスタバブル、怖さ評価で色分けしたピン
- フローティング M3 Search Bar（インクリメンタルサジェスト）
- 横スクロールするフィルターチップ + M3 フィルターシート（ジャンル/都道府県/怖さ）
- ピン選択でボトムシート（モバイル）／左サイドパネル（デスクトップ）が spring 展開。
  ドラッグで閉じられます
- FAB: 現在地へ移動 / 地図スタイル切替
- 初回訪問時に免責同意ダイアログ（私有地侵入禁止・近隣配慮・自己責任）

詳細は [`docs/arch/ui.md`](docs/arch/ui.md)。

## 5. 免責

本アプリは非公式のファンプロジェクトです。データの著作権は全国心霊マップに帰属します。
掲載地点への訪問は各自の責任で、法令とマナーを守って行ってください。
初回訪問時の `DisclaimerDialog` で同意を求めます。詳細は [`docs/arch/legal.md`](docs/arch/legal.md)。

## 6. 開発

- **作業規約**: [`AGENTS.md`](AGENTS.md)（小さく実装→検証→commit→push のサイクル、ブランチ運用、Sandbox 復旧手順）
- **仕様書**: [`docs/arch/`](docs/arch/README.md)（product / architecture / data-model / api / ui / scraping / adr / legal）
- **進捗**: [`docs/task-list.md`](docs/task-list.md)（Phase 0〜5）
- **計画書**: [`docs/planning/`](docs/planning/README.md)（`_TEMPLATE.md` 準拠）
- **Agent スキル**: [`.agent/skills/`](.agent/skills/index.md)（project-overview / tech-stack / sandbox-constraints）
- **フック**: [`.agent/hooks/`](.agent/hooks/index.md)（pre-task / verify-before-commit / log-task / sandbox-rebuild-recovery）

```bash
# 検証（commit 前に全 pass）
npm run typecheck
npm run lint
npm run build
```

詳細な運用は [`docs/ops/quality-gates.md`](docs/ops/quality-gates.md)。
