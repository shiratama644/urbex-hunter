# Testing — テスト方針（実装）

> `package.json` に `test` / `test:coverage` / `test:e2e` が存在し、`pnpm run test` は 37 passed（`src/lib/spots-repo` 26 + `scripts/scrape` 11）。詳細は `docs/task-list.md` QA-1/QA-2。

## 現状

- **Runner**: `vitest@5.0.1` + `jsdom@30` + `@testing-library/react@16` + `@testing-library/jest-dom@7`
- **Config**: `vitest.config.ts`（`environment: jsdom`, `globals: true`, `setupFiles: ["./vitest.setup.ts"]`, `include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.{ts,tsx}"]`）
- **Scripts**: `pnpm run test`（`vitest run`）、`pnpm run test:watch`（`vitest`）、`pnpm run test:coverage`（`vitest run --coverage`）、`pnpm run test:e2e`（`playwright test`）
- **E2E**: `@playwright/test` + `playwright.config.ts`（`testDir: ./e2e`, `webServer: pnpm run build && pnpm run start`）— Sandbox では `pnpm exec playwright test --list` の discovery のみを検証し、browser 実行は CI のみに限定（`docs/ops/quality-gates.md` 参照）

## 方針

- **ユニット（vitest）**: `src/lib/spots-repo.ts` の `clampBbox`/`filterGeoJson`/`fearTone`/`genreEmoji`、`scripts/scrape.ts` の `?q=lat,lng` / `"latitude":` / `data-lat` の3パターンと拡張フィールド（最寄り駅/投稿情報/ghostTypes/updatedAt）がカバー済み（`scrape.test.ts` 11）。
- **コンポーネント**: `@testing-library/react` で `FilterPanel` / `SpotDetailSheet` / `DisclaimerDialog` の表示・操作（ESC で閉じる等）を将来的に追加。Leaflet は jsdom でレンダリングしない（`MapClient` は `dynamic ssr:false` のため）。
- **API**: `src/app/api/spots/route.ts` のクエリパース（`bbox` 不正時のフォールバック）と `NextResponse.json` のヘッダ（`Cache-Control`）をモックしてテストする。DB はモックし、GeoJSON フォールバック分岐もカバーする。
- **E2E**: `e2e/smoke.spec.ts` が `request` fixture で `GET /` が 200 かつ `sr-only h1`（全国心霊マップ）を含むことを検証。`--list` discovery で 1 spec が見えることを CI で担保する。

## ツール

| 用途 | 採用 |
|---|---|
| Unit / Component | Vitest + @testing-library/react + jsdom + @vitejs/plugin-react |
| E2E | Playwright (`@playwright/test`) |
| Coverage | Vitest coverage (`@vitest/coverage-v8`) — 閾値は未設定（将来） |

`bun test` は使わない（本プロジェクトは `pnpm@12.5.1`）。`vitest` を watch モードで放置しない。`tailwind.config.ts` は作らない（v4 CSS-first）。

## 実行

```bash
pnpm run typecheck
pnpm run ci
pnpm run build
pnpm run test                 # 37 passed 期待
pnpm run test:coverage        # coverage（閾値未設定）
pnpm exec playwright test --list   # discovery: e2e/smoke.spec.ts 1 spec
pnpm run test:e2e             # browser 実行（CI のみ、Sandbox では省略）
```

## チェックリスト（導入済み）

- [x] `package.json` に `test` / `test:coverage` / `test:e2e` を追加
- [x] `vitest.config.ts` / `playwright.config.ts` を追加し、`tsconfig.json` / `biome` と整合
- [x] `docs/task-list.md` に QA-1/QA-2 を 100% に更新し、証拠（37 passed / --list 1 spec）を記録
- [x] CI（`docs/ops/quality-gates.md` / `.github/workflows/quality-gates.yml`）に unit + e2e discovery gate を追加
