# Quality Gates — urbex-hunter

## 目的

`pnpm run typecheck` / `pnpm run ci` / `pnpm run build`（および将来の `test` / `e2e`）を **ローカルと CI で同じコマンド**で実行し、壊れた状態を長時間維持しないこと（AGENTS.md §3.1）。

## Gate 一覧

| Gate | コマンド | 成功条件 | 実行タイミング |
|---|---|---|---|
| Typecheck | `pnpm run typecheck` | `tsc --noEmit` が 0 error | commit 前 / CI |
| Biome | `pnpm run ci` | `biome ci .` が 0 error | commit 前 / CI |
| Build | `pnpm run build` | `next build` が成功（`.next/` 生成） | commit 前 / CI |
| Unit | `pnpm run test` | Vitest 37 passed（`spots-repo` 26 + `scrape` 11） | commit 前 / CI |
| Coverage | `pnpm run test:coverage` | `vitest --coverage`（閾値未設定、将来） | CI（任意） |
| E2E discovery | `pnpm exec playwright test --list` | `e2e/smoke.spec.ts` 1 spec がリストされる | Local / CI（browser 不要） |
| E2E browser | `pnpm run test:e2e` | Playwright が全 pass（`request` smoke 200 + h1） | CI / 実環境のみ（Sandbox では未実行扱い） |

## ローカル実行

```bash
pnpm run typecheck
pnpm run ci          # = biome ci .（Biome 2.x）
pnpm run build
pnpm run test                 # 37 passed 期待
pnpm run test:coverage        # coverage（閾値未設定）
pnpm exec playwright test --list   # discovery: 1 spec（browser 不要、Sandbox でも実行可）
pnpm run test:e2e             # browser 実行（CI のみ）
```

ドキュメントのみ変更時は上記をスキップし、`grep -r "docs/arch" --include="*.md"` 等でリンク整合を確認する（AGENTS.md §3.1）。

## CI 実行

`.github/workflows/quality-gates.yml` が正本。`pnpm/action-setup@v4` + `cache: pnpm` + `pnpm install --frozen-lockfile` で `typecheck` / `biome ci` / `build` を実行する。`scrape_update.yml` とは権限・cron が分離（`contents: read` vs `write`）。

```yaml
# .github/workflows/quality-gates.yml
name: Quality Gates
on: [push, pull_request]
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4 # 12.5.1
      - uses: actions/setup-node@v4 # cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm run typecheck
      - run: pnpm run ci
      - run: pnpm run build
      - run: pnpm run test
      - run: pnpm exec playwright test --list  # discovery のみ、browser 不要
```

## Sandbox 制約との向き合い方

- **DB 無し**: `pnpm run build` は `data/spots.geojson` フォールバックで通ることを優先する。`DATABASE_URL` 未設定をエラーにしない。
- **外部ネットワーク**: `pnpm exec tsx scripts/scrape.ts` の全量実行は CI / 手動のみ。Sandbox では `PREFS` 絞り込みで少量検証する。
- **ブラウザ**: Playwright の browser 実行は Sandbox で捏造しない。`--list` での discovery までをローカル確認とする。
