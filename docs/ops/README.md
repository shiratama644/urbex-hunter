# Ops / CI 提案 — urbex-hunter

このディレクトリは、運用・CI・品質ゲートの提案を置く場所です。

## 現状の CI

- **週次 scrape**: `.github/workflows/scrape_update.yml`（本番ワークフロー）
  - cron `15 18 * * 0`（JST 月曜 03:15）
  - `pnpm install --frozen-lockfile` → `pnpm exec tsx scripts/scrape.ts`（`LIMIT_PER_PREF` / `CONCURRENCY=6`） → `git diff --stat` → 差分があれば `git add data/spots.geojson` → commit → push → `pnpm exec tsx scripts/seed.ts`（`DATABASE_URL` secret がある場合のみ）
  - `timeout-minutes: 45` / `permissions: contents: write`

新規 workflow を追加する場合は、本ディレクトリに提案 YAML を置き、レビュー後に `.github/workflows/` へ配置します（`docs/arch/adr.md` に記録）。

## ファイル

| ファイル | 役割 |
|---|---|
| [`quality-gates.md`](./quality-gates.md) | typecheck / lint / build / test / E2E の運用手順 |
| `github-actions-proposal.yml`（将来） | 新規 workflow の提案（例: quality-gates.yml）。必要時に作成 |

## 現在の品質ゲート要約

| Gate | コマンド | 実行場所 | 備考 |
|---|---|---|---|
| Typecheck | `pnpm run typecheck` | Local / CI | `tsc --noEmit` (strict) |
| Lint | `pnpm run ci` | Local / CI | `eslint .` (flat config) |
| Build | `pnpm run build` | Local / CI | `next build` |
| Unit | `pnpm run test` | Local / CI | Vitest 想定 |
| E2E discovery | `pnpm exec playwright test --list` | Local / CI | Browser 不要 |
| E2E browser | `pnpm run test:e2e` | CI / 実環境 | Sandbox では未実行扱い |
