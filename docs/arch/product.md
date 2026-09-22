# プロダクト定義 — urbex-hunter

## 用語

| 用語 | 意味 |
|---|---|
| **スポット（Spot）** | 心霊スポットの 1 件。`spotcd` が主キー。名称・住所・緯度経度・ジャンル・心霊現象等を持つ |
| **Genre（ジャンル）** | スポットの分類（例: トンネル / 住居 / 山・森 / 橋 / 神社・寺）。`GENRE_EMOJI` で絵文字付与 |
| **Phenomena（心霊現象）** | スポットで報告される現象（複数）。facets で集計される |
| **Fear Rating（怖さ評価）** | 5段階の評価値 + 評価人数。UI の色分け（`fearTone`）に使われる |
| **GeoJSON** | `data/spots.geojson` の FeatureCollection（Point）。DB の補助的ソース・オブ・トゥルース |
| **Facets** | ジャンル・都道府県・心霊現象の件数集計（フィルタUI用） |

## 作るもの

**全国心霊マップ Explorer** — ブラウザで日本全国の心霊スポットを地図で探索する非公式ファンプロジェクト。

- **全画面地図**でスポットを閲覧・検索・絞り込みできる
  - CartoDB Dark Matter ⇄ Positron 切替、`leaflet.markercluster` によるクラスタバブル、怖さ評価で色分けしたピン
  - フローティング M3 Search Bar（インクリメンタルサジェスト）、横スクロールフィルターチップ + フィルターシート（ジャンル/都道府県/怖さ）
  - ピン選択で Bottom Sheet（モバイル）/ サイドパネル（デスクトップ）が spring 展開。ドラッグで閉じられる
  - FAB: 現在地へ移動 / 地図スタイル切替
- **データは ghostmap.jp 由来**（752件 / 47都道府県）。著作権は全国心霊マップに帰属し、商用再配布しない
- **免責を必須表示**：初回訪問時に `DisclaimerDialog`（私有地侵入禁止・近隣配慮・自己責任）。訪問の推奨・煽りをしない
- **週次でデータ更新**：`.github/workflows/scrape_update.yml` が毎週月曜 03:15 JST に scrape → `data/spots.geojson` 更新 → 任意で DB sync
- **ライセンス MIT**（`LICENSE`）

## 作らないもの（初期スコープ外）

- ユーザー投稿・お気に入り・認証・ランキング（必要なら ADR で合意してから）
- ルート案内・ナビゲーションの turn-by-turn（外部地図アプリへのリンクまでに留める）
- ghostmap.jp 以外へのスクレイピング拡張
- 有料化・広告の本格導入

## 現行コード（zip 展開直後）の扱い

`nextjs-ghost-map-application.zip` からの展開直後の単一パッケージ。理想形への段階改善の出発点。

| 資産 | 判定 | 備考 |
|---|---|---|
| `src/app/{layout,page,globals.css}` | **維持・磨く** | M3 トークン + Server Component の核。`@theme` を壊さない |
| `src/components/{GhostMapApp,Map/MapClient,SpotDetailSheet,FilterPanel,DisclaimerDialog}` | **維持・磨く** | 責務境界を守りつつ a11y / パフォーマンス改善 |
| `src/lib/{types,spots-repo}` | **維持・拡張** | `SpotFeature` / `fearTone` / `querySpots` が正本。テストを追加する |
| `src/db/{index,schema}` | **維持** | `spots` スキーマが正本。Drizzle のまま |
| `src/app/api/{spots,facets,health}` | **維持・拡張** | 契約は `api.md`。キャッシュ戦略を明文化する |
| `scripts/{scrape,seed}` | **維持・強化** | ポライトネスを守りつつリトライ・差分を強化 |
| `data/spots.geojson` | **維持** | 752件。DB 補助のソース・オブ・トゥルース |
| `.github/workflows/scrape_update.yml` | **維持** | 週次更新の正規ワークフロー |

## 初期スコープで決めた運用（詳細は [adr.md](./adr.md)）

- アカウント: **無し**（将来必要なら ADR で設計）
- DB: **PostgreSQL + Drizzle**。無い環境では GeoJSON フォールバック
- 地図タイル: **CartoDB**（Dark Matter / Positron）。タイルプロバイダ変更は ADR
- キャッシュ: `GET /api/spots` は `revalidate 86400` + `s-maxage 86400`。変更時は ADR
- スクレイピング: **対象は ghostmap.jp のみ**。同時接続 6、UA 維持、既存 GeoJSON とマージ
