# urbex-hunter ドキュメント索引

urbex-hunter（全国心霊マップ Explorer 👻）は、全国心霊マップ由来のスポットデータを
**Next.js (App Router) + PostgreSQL(Drizzle) + Tailwind v4 (M3 Expressive) + Leaflet**
で探索する非公式マップアプリです。現行コードは `nextjs-ghost-map-application.zip` からの展開直後（単一パッケージ / npm）です。

旧cod-web由来の旧仕様は存在しません。アーカイブが必要になった場合は `.archive/` に退避します。

---

## ディレクトリ

```
docs/
├── README.md            ← 本ファイル
├── task-list.md         ★ 進捗の唯一の正本
├── arch/                ★ 仕様書（どう作るか）
│   ├── README.md        # 仕様書一覧と実装時に守ること
│   ├── product.md       # プロダクト定義・用語・現行資産
│   ├── architecture.md  # レイヤー・リポジトリ・依存規則
│   ├── data-model.md    # DB スキーマ・GeoJSON・投入フロー
│   ├── api.md           # API 契約・クエリ・キャッシュ
│   ├── ui.md            # M3 トークン・Leaflet・コンポーネント境界
│   ├── scraping.md      # スクレイピング方針・ポライトネス
│   ├── adr.md           # 意思決定ログ
│   ├── legal.md         # 法務・免責・データ帰属
│   └── testing.md       # テスト方針（導入時に作成）
├── planning/            # 計画書（着手前に _TEMPLATE.md で作成）
│   ├── README.md        # 計画書索引・次に使う計画
│   ├── _TEMPLATE.md     # 新規計画書の必須形式
│   ├── HANDOFF.md       # 次セッションへの橋渡し（先に読む）
│   └── complete/        # 完了済み計画
│       └── README.md
├── ops/                 # CI / quality gate 提案
│   ├── README.md
│   └── quality-gates.md
└── research/            # 調査結果（必要に応じて）
    └── README.md
```

仕様書（`arch/`）= どう作るかの正本。計画書（`planning/`）= 何をどの順で。進捗（`task-list.md`）= 状態と証拠。運用提案（`ops/`）= CI / quality gate の配置案。調査（`research/`）= 根拠と採用判断の補助。

---

## 読む順

### 通常の実装タスク

| 順 | 文書 | 内容 |
|---:|---|---|
| 0 | [`planning/HANDOFF.md`](planning/HANDOFF.md) | 次セッションへの橋渡し。着手前に必ず読む |
| 1 | [`../README.md`](../README.md) | プロダクト概要・セットアップ（現行コード） |
| 2 | [`task-list.md`](task-list.md) | 進捗の唯一の正本。次に着手するタスク |
| 3 | [`planning/README.md`](planning/README.md) → 対象フェーズの `planning/*_PLAN.md` | 計画書の入口と、そのタスクで何をどの順で実施するか |
| 4 | [`arch/README.md`](arch/README.md) | 仕様書一覧と実装時に守ること |
| 5 | [`arch/product.md`](arch/product.md) / [`arch/architecture.md`](arch/architecture.md) / [`arch/adr.md`](arch/adr.md) | プロダクト定義、層、覆さない決定 |
| 6 | 対象領域の `arch/*.md` | data-model / api / ui / scraping / legal 等 |
| 7 | [`.agent/skills/index.md`](../.agent/skills/index.md) → 必要スキル | 実装時のハマりどころ・コツ |

### 調査・レビュータスク

| 順 | 文書 | 内容 |
|---:|---|---|
| 0 | [`arch/product.md`](arch/product.md) | 何を作るか・作らないか |
| 1 | [`arch/scraping.md`](arch/scraping.md) | スクレイピングのポライトネスと抽出仕様 |
| 2 | [`arch/legal.md`](arch/legal.md) | 免責・データ帰属・禁止事項 |
| 3 | [`research/README.md`](research/README.md) | 追加調査が必要な時の入口 |

実装担当は [`arch/README.md`](arch/README.md) の「実装時に守ること」も読むこと。
