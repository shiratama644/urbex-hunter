# HANDOFF — 次セッションへの橋渡し — urbex-hunter

> 本ファイルは計画書の代替ではない。次セッションが最初に読む 1 ファイル。
> 仕様正本は `docs/arch/`、進捗正本は `docs/task-list.md`、計画索引は `docs/planning/README.md`。
> 更新日: 2026-09-22（SETUP 導入直後）

## 現状サマリ

- `nextjs-ghost-map-application.zip`（42 files / 752件 GeoJSON）を `unzip -o` で展開済み。`package.json` / `src/` / `data/` / `scripts/` / `.github/workflows/scrape_update.yml` がワークツリーに存在する。
- `AGENTS.md` / `.agent/`（hooks/skills）/ `docs/`（arch + task-list + planning）を **cod-web 型から urbex-hunter 用に適合**して新規導入した（本タスク SETUP-0〜4）。
- `README.md` は zip 由来の Ghost Map 解説を保持しつつ、`docs/arch` / `AGENTS.md` への導線を追加する予定（SETUP-4）。
- 残りは **疎通確認**（SETUP-5: `npm run typecheck` / `npm run lint` / `npm run build`）。

## 次に着手すること

| 優先 | ID | 内容 | 参照 |
|---|---|---|---|
| 1 | SETUP-5 | 疎通確認（typecheck / lint / build）。DB 無しでも GeoJSON 経路で build が通ることを確認する | `docs/task-list.md` / `docs/arch/README.md` / `.agent/hooks/verify-before-commit.md` |

SETUP-5 が完了すれば Phase 1（MAP-1〜）へ進める。

## 読む順（次セッション）

1. 本ファイル（HANDOFF.md）
2. `docs/task-list.md`（Phase 0 の表）
3. `docs/arch/README.md` → `docs/arch/product.md` / `architecture.md`
4. `.agent/skills/project-overview/SKILL.md` → `tech-stack/SKILL.md`

## 注意・ハマりどころ

- **Tailwind v4**: `tailwind.config.ts` を作らない。トークンは `src/app/globals.css` の `@theme`。
- **Leaflet**: `MapClient` は `dynamic ssr:false`。`window is not defined` に注意。
- **DB**: Sandbox では `DATABASE_URL` が無い。`ensureSeeded()` の GeoJSON フォールバックを壊さない。
- **Scrape**: Sandbox で全量（47×16）を実行しない。`PREFS=13 LIMIT_PER_PREF=5` で少量検証する。
- **ブランチ**: セッション固定ブランチは毎回 `git branch --show-current` で確認する。過去ブランチ名を文書に残さない（AGENTS.md §4.4）。

## 旧前提・読んではいけないもの

- cod-web の旧前提（Bun / Vite / Babylon.js / SimProfile / WebSocket）は **本リポジトリでは無効**。`docs/arch/adr.md`（urbex-hunter 版）が正。
- `nextjs-ghost-map-application.zip` 自体は展開後に残るが、再展開時は `-o` で上書きする。zip 内の `README.md` はルート `README.md` にマージ済みのため、zip 単体を正本にしない。

## 完了済み計画

- （なし — SETUP が最初の計画。完了後に `docs/planning/complete/` へ移動する）
