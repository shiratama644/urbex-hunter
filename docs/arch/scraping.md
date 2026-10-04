# Scraping — 対象・抽出・ポライトネス・運用

## 対象

**全国心霊マップ (https://ghostmap.jp/) のみ**。他サイトへの拡張は ADR で合意してから。

- 取得元: `BASE = https://ghostmap.jp`
- UA: `GhostMapStudyBot/1.0 (+https://example.com/bot)`。削除・匿名化しない。
- 取得範囲: 都道府県別の一覧（`PREFECTURES` 47件）を巡回し、各県で `LIMIT_PER_PREF` 件（既定16）を収集する。

## 使い方

```bash
npx tsx scripts/scrape.ts                   # 全47都道府県 × 16件
LIMIT_PER_PREF=30 npx tsx scripts/scrape.ts # 件数を増やす
PREFS=13,27 npx tsx scripts/scrape.ts       # 東京・大阪のみ
CONCURRENCY=6 npx tsx scripts/scrape.ts     # 同時接続（既定6）
```

- `PREFS` は都道府県コードの CSV（`1=北海道 ... 47=沖縄`）。デバッグ時は `PREFS=13 LIMIT_PER_PREF=5` で少量検証する。
- `LIMIT_PER_PREF` を大きくすると実行時間が増える（週次 workflow は `timeout-minutes: 45`）。
- `CONCURRENCY` は同時接続数（既定6）。上げる場合は本ドキュメントと ADR を更新してから（相手サーバー負荷に直結）。

## 抽出項目

| 項目 | ソース | 備考 |
|---|---|---|
| `spotcd` | 一覧のリンク / 詳細URL | 主キー。数値 |
| スポット名 | 一覧/詳細のタイトル | `name` |
| 読み仮名 | 詳細のふりがな | `kana` |
| 住所・都道府県・市区町村 | 詳細の住所欄 | `address` / `prefecture` / `city` |
| 緯度経度 | 「Googleマップを開く」リンクの `?q=lat,lng` を**正規表現**で抽出 | `lat` / `lng`。リンク形式変更時は regex を更新する |
| ジャンル | 詳細のジャンル欄 | `genre`（例: トンネル）。`GENRE_EMOJI` で絵文字付与 |
| 状態 | 詳細の状態欄 | `status` |
| 心霊現象 | 詳細の現象リスト | `phenomena: string[]` |
| 特徴タグ | 詳細の特徴欄 | `features: string[]` |
| 総合得点 / 全国ランク / 県別ランク | 詳細のスコア欄 | `totalScore` / `nationalRank` / `prefRank` |
| 怖さ評価(5段階) / 評価人数 | 詳細の評価欄 | `fearRating` / `ratingCount` |
| 概要 / 代表コメント | 詳細の本文 | `outline` / `comment` |
| 画像URL / 元記事URL | 詳細の画像・リンク | `imageUrl` / `sourceUrl`（必須） |
| 最寄り駅 / アクセス / 周辺施設 | 詳細の地図テーブル (`最寄り駅`/`アクセス`/`周辺施設`) | `nearestStation` / `access` / `surroundingFacilities: string[]` — Phase 3 で `fetch_page` 実地確認し追加 |
| 投稿情報（写真/動画/ストビュー/体験談/コメント件数） | 詳細の `投稿情報` 行 | `photoCount` / `videoCount` / `streetViewCount` / `experienceCount` / `commentCount` — 正規表現 `[0-9０-９]+` で全角対応 |
| 幽霊タイプ別投票 | 詳細の `どんな幽霊が出ましたか？` | `ghostTypes: Record<string,number>`（少年/少女/男性/女性/老爺/老婆/動物/正体不明）— HTML 全体から正規表現で堅牢に抽出 |
| 更新日 | ページ上部 `更新日:2026/09/22` | `updatedAt`（`YYYY-MM-DD` に正規化） |
| よくある質問 | 詳細の `よくある質問と回答` | `faq: {q,a}[]`（最大8件）— `#chapter_faq dt/dd` を優先、無ければ null |

抽出失敗（リンク無し・正規表現不一致等）は `null` / `[]` に倒し、スクレイパー全体を落とさない。`spotcd` が取れない行はスキップする。

## 出力（`data/spots.geojson`）

```json
{
  "type": "FeatureCollection",
  "count": 752,
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [lng, lat] },
      "properties": { "spotcd": 123, "name": "…", /* 上記項目 */ }
    }
  ]
}
```

- **既存ファイルとマージ**する（単純上書きしない）。`spotcd` 重複は最新で上書きし、`count` を更新する。
- 既存 `spots.geojson` が無い場合は新規作成する。
- ファイルサイズは約 932KB。Git 追跡する。

## ポライトネス（必須）

| 項目 | 方針 |
|---|---|
| 同時接続 | 既定 `CONCURRENCY=6`。増やす場合は ADR で合意 |
| 待機 | リクエスト間に待機を入れる（実装は `scrape.ts` の delay）。待機を削除しない |
| UA | `GhostMapStudyBot` を維持。偽装しない |
| リトライ | 一時的な失敗は有限回リトライ。無限リトライにしない |
| 対象外アクセス | ghostmap.jp 以外へのリクエストを足さない |
| 大量取得 | Sandbox では全量（47×16）を避け、`PREFS` 絞り込みで少量検証する。全量は週次 workflow に任せる |

違反は相手サーバーへの迷惑行為になるため、**ポライトネスを弱める変更は禁止**。

## DB 投入（`scripts/seed.ts`）

```bash
npx drizzle-kit push        # スキーマ適用（CREATE TABLE / INDEX）
npx tsx scripts/seed.ts     # GeoJSON → PostgreSQL upsert（spotcd PK）
```

- `seed.ts` は `readFile(data/spots.geojson)` → `toRow()` → `insert ... onConflictDoUpdate`。
- `DATABASE_URL` が必要（`drizzle.config.json` の `postgresql://postgres:postgres@127.0.0.1:5432/app_db` がローカル既定）。
- API 初回アクセス時にテーブルが空なら `ensureSeeded()` が GeoJSON から自動投入する（advisory lock で多重実行防止）。seed を手動で実行しなくても地図は表示される。

## 週次自動更新（`.github/workflows/scrape_update.yml`）

```yaml
on:
  schedule: [{ cron: "15 18 * * 0" }] # 毎週月曜 03:15 JST (= 日曜 18:15 UTC)
  workflow_dispatch: { inputs: { limit_per_pref: "16" } }
permissions: { contents: write }
jobs:
  scrape:
    runs-on: ubuntu-latest
    timeout-minutes: 45
    steps:
      - checkout, setup-node 22, npm ci
      - run: npx tsx scripts/scrape.ts  (env: LIMIT_PER_PREF / CONCURRENCY=6)
      - run: git diff --stat / feature count log
      - commit: if diff, git add data/spots.geojson && commit "chore(data): weekly refresh…" && push
      - sync DB: if DATABASE_URL secret exists, npx tsx scripts/seed.ts
```

- `timeout-minutes: 45` / `contents: write` を壊さない。
- 差分が無い時は commit しない分岐を維持する。
- `DATABASE_URL` secret が設定されている場合のみ DB sync する。
