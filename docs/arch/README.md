# docs/arch — 仕様書（理想形）

ここは **どう作るか** の正本です。計画は [`../planning/README.md`](../planning/README.md)、進捗は [`../task-list.md`](../task-list.md)。

現行コード（`nextjs-ghost-map-application.zip` からの展開直後）と食い違う場合、**本ディレクトリが目標**です。実装の現状は task-list の「現行コード」節を見る。外部技術調査は [`../research/README.md`](../research/README.md) を入口にし、仕様へ採用する場合は本ディレクトリへ反映してから実装します。

## 実装時に守ること

1. **存在しない API を発明しない。** 記載外の外部仕様（Next.js / Leaflet / Drizzle）は公式ドキュメントで実在とシグネチャを確認する。
2. **フェーズ順を飛ばさない。** [`../task-list.md`](../task-list.md) の完了条件を満たす前に次へ進まない。
3. **[`adr.md`](./adr.md) に反する実装をしない。** 変更が必要なら実装せず人間に確認する。
4. **ADR に無い未決は勝手に決めない。** 該当箇所に到達したら `ask_user` で質問する。
5. **地図とデータ取得を混ぜない。** [`architecture.md`](./architecture.md) の Server/Client 境界を守る。
6. **スクレイピングのポライトネスを守る。** [`scraping.md`](./scraping.md) の同時接続・UA・待機を勝手に変えない。
7. **免責を薄めない。** [`legal.md`](./legal.md) の文言を削除・弱体化しない。

## 読み方

| 状況 | 最初に読むもの | 次に読むもの |
|---|---|---|
| 実装を始める | [`../task-list.md`](../task-list.md) → [`../planning/README.md`](../planning/README.md) | 対象フェーズの計画書 → 本 README の仕様書一覧 |
| DB / API を触る | [`data-model.md`](./data-model.md) → [`api.md`](./api.md) | `src/db/schema.ts` / `src/lib/spots-repo.ts` |
| 地図 / UI を触る | [`ui.md`](./ui.md) | `src/app/globals.css` / `src/components/Map/MapClient.tsx` |
| スクレイパーを触る | [`scraping.md`](./scraping.md) | `scripts/scrape.ts` / `.github/workflows/scrape_update.yml` |
| ADR に反しそう | [`adr.md`](./adr.md) | 実装せずユーザーへ確認 |

## 仕様書一覧

| ファイル | 内容 |
| :--- | :--- |
| [product.md](./product.md) | プロダクト定義・用語・現行資産の扱い |
| [architecture.md](./architecture.md) | レイヤー・リポジトリ・依存規則・Server/Client 境界 |
| [data-model.md](./data-model.md) | `spots` スキーマ・GeoJSON・投入フロー・index |
| [api.md](./api.md) | API 契約（spots/facets/health）・クエリ・キャッシュ |
| [ui.md](./ui.md) | M3 トークン・Leaflet・コンポーネント境界・レスポンシブ |
| [scraping.md](./scraping.md) | 対象・抽出項目・ポライトネス・出力・マージ |
| [adr.md](./adr.md) | 意思決定ログ |
| [legal.md](./legal.md) | 法務・免責・データ帰属 |
| [testing.md](./testing.md) | テスト方針（導入時に作成。現状は雛形） |

新しい設計領域が固まったら `kebab-case.md` を追加し、本一覧と [`../README.md`](../README.md) を更新する。
