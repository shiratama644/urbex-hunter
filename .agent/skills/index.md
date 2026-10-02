# Skills Index — Agent のスキル集

> このファイルは `.agent/skills/` の**入口**。タスク着手時に本ファイルだけ読み、
> 必要なスキルだけをピンポイントで読み込む（コンテキストの無駄遣いを防ぐ）。
>
> ここにあるのは **Agent 自身のスキル** — 「このプロジェクトで何をどうやるとうまくいくか」
> という実践的なノウハウ・テクニック・手順・パターン・コードベース知識。
> 仕様書（設計の正本）ではない。設計の事実は [`../../docs/arch/`](../../docs/arch/README.md) が正本。
> 作業規約は [`../../AGENTS.md`](../../AGENTS.md)。

## 読み方ガイド（どの状況でどのスキルを使うか）

| 状況 | 使うスキル |
| :--- | :--- |
| 初回 / 全体把握 | [`project-overview/SKILL.md`](./project-overview/SKILL.md) |
| 地図・DB・スクレイパーの実装でハマった時 | [`tech-stack/SKILL.md`](./tech-stack/SKILL.md) |
| 「動かない / DB が無い / 地図が表示されない / 外部取得できない」環境トラブル | [`sandbox-constraints/SKILL.md`](./sandbox-constraints/SKILL.md) |
| 設計の正本（プロダクト・スキーマ・API・UI・免責） | [`../../docs/arch/`](../../docs/arch/README.md)（product / architecture / data-model / api / ui / scraping / adr / legal） |

## スキル一覧

| スキル | できるようになること（Agent の能力） | 最終更新 |
| :--- | :--- | :--- |
| [project-overview/SKILL.md](./project-overview/SKILL.md) | プロダクト目標・現行コード（zip 由来）と理想アーキテクチャを素早く把握する | 2026-09-22 |
| [tech-stack/SKILL.md](./tech-stack/SKILL.md) | Next.js / Tailwind v4 / Leaflet / Drizzle / cheerio のハマりどころを避けて実装できる | 2026-09-22 |
| [sandbox-constraints/SKILL.md](./sandbox-constraints/SKILL.md) | Sandbox / DB不在 / ネットワーク制限を迂回して検証できる | 2026-09-22 |

## 設計仕様の正本（スキルではなく docs/arch/）

| 仕様書 | 内容 |
| :--- | :--- |
| [docs/arch/product.md](../../docs/arch/product.md) | プロダクト定義・用語・現行資産 |
| [docs/arch/architecture.md](../../docs/arch/architecture.md) | レイヤー・リポジトリ・依存規則 |
| [docs/arch/data-model.md](../../docs/arch/data-model.md) | DB スキーマ・GeoJSON・投入フロー |
| [docs/arch/api.md](../../docs/arch/api.md) | API 契約・クエリ・キャッシュ |
| [docs/arch/ui.md](../../docs/arch/ui.md) | M3 Expressive トークン・Leaflet・コンポーネント境界 |
| [docs/arch/scraping.md](../../docs/arch/scraping.md) | スクレイピング方針・ポライトネス |
| [docs/arch/adr.md](../../docs/arch/adr.md) | 意思決定ログ |
| [docs/arch/legal.md](../../docs/arch/legal.md) | 法務・免責・データ帰属 |

> 実装テクニック・ハマりどころは **skills** に貯め、設計の事実は **docs/arch** を正本とする。

## 運用ルール

- 新しいノウハウを得たらスキルとして追加/更新し、本 index の「最終更新」も更新する。
- 新スキル追加時は「読み方ガイド」と「一覧」の両方に追記する。
- スキルは実践的なやり方・コードパターン・回避策を書く。設計の正本は docs/arch。
- AGENTS.md と重複する作業規約はスキルに書かず AGENTS.md を正とする。
- 各スキルは `<kebab-case>/SKILL.md`（YAML frontmatter に `name` / `description`）。
