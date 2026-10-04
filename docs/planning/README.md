# Planning Index — urbex-hunter

計画書（`docs/planning/`）は、`docs/task-list.md` の各タスクを **どの順で、どの範囲で、何をもって完了とするか** に分解する場所です。仕様そのものの正本は [`../arch/`](../arch/README.md) です。完了済み計画は [`complete/`](./complete/) に置きます。

## まず読むもの

| 順 | 文書 | いつ読むか | 内容 |
|---:|---|---|---:|
| 1 | [`../task-list.md`](../task-list.md) | 常に最初 | 状態・依存・次に着手できるタスクの唯一の正本 |
| 2 | [`HANDOFF.md`](./HANDOFF.md) | 次セッション/実装再開時 | 現行フェーズの注意、直近の完了状況、読んではいけない旧前提 |
| 3 | 対象タスクの `*_PLAN.md` | 実装/調査に入る前 | 変更範囲、禁止事項、DoD、停止条件、検証方法 |
| 4 | [`../arch/adr.md`](../arch/adr.md) | ADR に反しそうな時 | 覆してよい決定か確認する |
| 5 | [`.agent/skills/index.md`](../../.agent/skills/index.md) | 実装のコツが必要な時 | 地図/DB/スクレイパー のハマりどころ |

## 計画書一覧

| 文書 | 対応 ID | 状態 | 役割 |
|---|---|---|---|
| [`_TEMPLATE.md`](./_TEMPLATE.md) | — | 現用 | 新規計画書の必須形式 |
| [`HANDOFF.md`](./HANDOFF.md) | — | 現用 | 次セッションへの橋渡し。計画の代替ではない |
| [`SETUP_PLAN.md`](./SETUP_PLAN.md)（本タスクで作成） | `SETUP-0`〜`SETUP-5` | 実装中 | zip 展開・AGENTS/.agent/docs 導入・疎通 |
| `PHASE01_PLAN.md` | `MAP-1`〜`MAP-4` | 未着手 | 地図の堅牢化 |
| `PHASE02_PLAN.md` | `API-1`〜`DB-2` | 未着手 | API / DB 強化 |
| `PHASE03_PLAN.md` | `SCR-1`〜`SCR-3` | 未着手 | スクレイパー強化 |

完了済み計画は `complete/` へ移動します（移動時は `task-list.md` のリンクも更新する）。

## 次に着手可能なタスク

| 優先 | ID | 内容 | 事前に読むもの |
|---:|---|---|---|
| 1 | SETUP-5 | 疎通確認（`npm run typecheck` / `npm run lint` / `npm run build`） | [`HANDOFF.md`](./HANDOFF.md), [`../task-list.md`](../task-list.md), [`../arch/`](../arch/README.md) |
| 2 | MAP-1 | bbox クランプと zoom 閾値のテスト | [`../arch/api.md`](../arch/api.md), [`../arch/ui.md`](../arch/ui.md) |
| 3 | API-1 | facets キャッシュと COUNT 最適化 | [`../arch/data-model.md`](../arch/data-model.md), [`../arch/api.md`](../arch/api.md) |

## 計画書を書く/更新する時のルール

- 新規タスクは先に [`../task-list.md`](../task-list.md) へ ID を追加する（ID は再利用しない）。
- 新規計画書は [`_TEMPLATE.md`](./_TEMPLATE.md) の §1〜§9 を最低限満たす。
- 実装範囲、禁止事項、DoD、停止条件を必ず書く。
- 計画書と [`../arch/`](../arch/README.md) が矛盾したら、勝手に片方を正にせずユーザーへ確認する。
- 完了後は「実績と証拠」に commit / validation を書く。ただし過去ログや `.archive/` は書き換えない。
- 外部仕様（Next.js / Leaflet / Drizzle）を増やす場合は公式ドキュメントで確認する。
