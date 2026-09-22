# Research Index — urbex-hunter

調査結果を保存するディレクトリです。現時点で必須の調査は無いため、本ファイルのみ置きます。必要に応じて `DR-*.md` を追加してください。

## 位置づけ

| 種別 | 役割 | 注意 |
|---|---|---|
| `DR-*` | 個別調査の詳細証跡 | URL / clone SHA / source 種別 / 読んだファイル一覧を確認する |
| `../arch/` | 仕様正本 | 調査結果を採用する場合は `docs/arch/` に反映してから実装する |

## 追加時のルール

- ファイル名は `DR-<連番>_<kebab-case>.md`（例: `DR-1_leaflet-clustering-research.md`）
- 各 DR の先頭で「目的・調査範囲・禁止事項（live service 観測等）」を明記する
- 一次情報（公式ドキュメント / npm metadata / public repo）を優先し、二次情報（ブログ / 動画 / AI 調査）は単独で断定しない
- 調査は設計の正本ではない。採用判断は `docs/arch/` へ反映してから実装する

## 候補テーマ（必要時に調査）

- Leaflet / react-leaflet / markercluster のバージョン互換と代替（MapLibre 等）
- CartoDB タイルの利用規約と代替プロバイダ
- Drizzle / PostgreSQL の index 戦略と `EXPLAIN` 検証
- ghostmap.jp の HTML 構造変化と正規表現の堅牢化
