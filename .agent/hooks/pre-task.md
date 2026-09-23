# Hook: Pre-Task（タスク開始時）

> **トリガー**: ユーザーから指示を受け、作業を開始する直前。
> **目的**: 現状を把握し、必要な知識だけを読み込み、スコープ違い/履歴破壊を防ぐ。

## 手順

### 1. 現状把握（AGENTS.md §4.1）

```bash
git status
git branch --show-current
git log -5 --oneline
```
- ※ ブランチ名は**セッションごとに変わる**。AGENTS.md §4.4 の記載値を鵜呑みにせず、必ず `git branch --show-current` で確認する。過去セッションのブランチ名は文書に残さない方針（AGENTS.md §4.4）。
- 未コミット変更があれば勝手に破棄・混入しない。
- ログが起点 1 件のみ / `git status` が大量の削除+未追跡 / `node_modules` 無 → **Sandbox 再構築**。→ [`sandbox-rebuild-recovery.md`](./sandbox-rebuild-recovery.md)。

### 2. 知識のピンポイント読込（本 hook の核心）

[`../skills/index.md`](../skills/index.md) の「読み方ガイド」で**該当スキルだけ**を読む。
- 全スキルを常に読まない（コンテキスト浪費）。
- 初回/全体把握が必要な時だけ `project-overview/SKILL.md` + `tech-stack/SKILL.md`。
- 設計仕様 → **仕様書 [`../../docs/arch/`](../../docs/arch/README.md)**（product / architecture / api / ui / scraping / adr）。環境制約 → `sandbox-constraints/SKILL.md`。
- 計画書は [`../../docs/planning/`](../../docs/planning/)。進捗は [`../../docs/task-list.md`](../../docs/task-list.md)。

### 3. docs/ と実コードの優先順位（AGENTS.md §6.9）

- 計画書（`docs/planning/*PLAN.md`）と AGENTS.md/skills が矛盾 → **計画書が正**。
- 計画書に無い事項 → 仕様書 docs/arch/ → AGENTS.md（特に §6）→ skills の順。
- 現行コード（Next.js + Leaflet + Drizzle）と arch が食い違う間は、**新規コードは arch**（仕様正本）を優先する。ただし `data/spots.geojson` と `src/db/schema.ts` が乖離している場合は、どちらが正か `docs/arch/data-model.md` で確認する。

### 4. タスク粒度の確認（AGENTS.md §1.2）

1 タスク = 1 つの意味のある論理的単位。「ついでに」スコープを広げない。
- 新しい問題を見つけたら現在のタスクに混ぜず、`docs/task-list.md` に新タスクとして登録（AGENTS.md §6.10）。

### 5. 地図アプリ固有の心構え

- **Server / Client の境界**：Server Component で `querySpots` / `getFacets` を呼び、`MapClient` は `dynamic ssr:false`。地図の状態とデータ取得を混ぜない（[`../../docs/arch/architecture.md`](../../docs/arch/architecture.md)）。
- **DB 不在時のフォールバック**：ローカルで `DATABASE_URL` が無い場合は `ensureSeeded()` が GeoJSON から読む経路を壊さない。DB 直結を前提にしない。
- **スクレイピングのポライトネス**：`PREFS` / `LIMIT_PER_PREF` / `CONCURRENCY` を守り、全47都道府県の一括再取得は週次 workflow に任せる。Sandbox で大量リクエストをしない。

## 完了後

→ 実装 → [`verify-before-commit.md`](./verify-before-commit.md) で検証 → commit/push → [`log-task.md`](./log-task.md) でログ記録。
