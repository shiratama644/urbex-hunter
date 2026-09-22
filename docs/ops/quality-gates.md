# Quality Gates — urbex-hunter

## 目的

`npm run typecheck` / `npm run lint` / `npm run build`（および将来の `test` / `e2e`）を **ローカルと CI で同じコマンド**で実行し、壊れた状態を長時間維持しないこと（AGENTS.md §3.1）。

## Gate 一覧

| Gate | コマンド | 成功条件 | 実行タイミング |
|---|---|---|---|
| Typecheck | `npm run typecheck` | `tsc --noEmit` が 0 error | commit 前 / CI |
| Lint | `npm run lint` | `eslint .` が 0 error / 0 warning | commit 前 / CI |
| Build | `npm run build` | `next build` が成功（`.next/` 生成） | commit 前 / CI |
| Unit | `npm run test`（導入後） | Vitest が全 pass | commit 前 / CI |
| Coverage | `npm run test:coverage`（導入後） | threshold を満たす | CI |
| E2E discovery | `npm run test:e2e -- --list`（導入後） | spec 数が期待どおり | Local / CI（browser 不要） |
| E2E browser | `npm run test:e2e`（導入後） | Playwright が全 pass | CI / 実環境のみ（Sandbox では未実行扱い） |

## ローカル実行

```bash
npm run typecheck
npm run lint
npm run build
# テスト導入後
npm run test
npm run test:coverage
npm run test:e2e -- --list
```

ドキュメントのみ変更時は上記をスキップし、`grep -r "docs/arch" --include="*.md"` 等でリンク整合を確認する（AGENTS.md §3.1）。

## CI 実行（将来の quality-gates.yml 提案）

`.github/workflows/scrape_update.yml` とは別に、quality gate 用の workflow を追加する場合は `docs/ops/github-actions-proposal.yml` に提案を置き、レビュー後に `.github/workflows/quality-gates.yml` へ配置する。

```yaml
# docs/ops/github-actions-proposal.yml（提案例）
name: quality-gates
on: [push, pull_request]
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: 'npm' }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run build
      # - run: npm run test:coverage
      # - run: npm run test:e2e -- --list
```

## Sandbox 制約との向き合い方

- **DB 無し**: `npm run build` は `data/spots.geojson` フォールバックで通ることを優先する。`DATABASE_URL` 未設定をエラーにしない。
- **外部ネットワーク**: `npx tsx scripts/scrape.ts` の全量実行は CI / 手動のみ。Sandbox では `PREFS` 絞り込みで少量検証する。
- **ブラウザ**: Playwright の browser 実行は Sandbox で捏造しない。`--list` での discovery までをローカル確認とする。
