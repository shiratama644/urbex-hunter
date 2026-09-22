# Testing — テスト方針（雛形）

> 現状 `package.json` に `test` スクリプトは無い。導入時に本ファイルと `docs/task-list.md` を更新し、ADR で合意してから実装する。

## 方針

- **ユニット**: `src/lib/spots-repo.ts` の `parseBbox` / `bbox` 範囲条件 / `querySpots` のフィルタ分岐、`src/lib/types.ts` の `fearTone` / `genreEmoji`、`scripts/scrape.ts` の正規表現（`?q=lat,lng` 抽出）を優先する。
- **コンポーネント**: `@testing-library/react` で `FilterPanel` / `SpotDetailSheet` / `DisclaimerDialog` の表示・操作（ESC で閉じる等）をテストする。Leaflet は jsdom でレンダリングしない（`MapClient` は `dynamic ssr:false` のため）。
- **API**: `src/app/api/spots/route.ts` のクエリパース（`bbox` 不正時のフォールバック）と `NextResponse.json` のヘッダ（`Cache-Control`）をテストする。DB はモックし、GeoJSON フォールバック分岐もカバーする。
- **E2E**: Playwright を導入する場合は `test:e2e` スクリプトと `playwright.config.ts` を追加し、Sandbox では browser 実行を捏造せず CI のみで実行する（`docs/ops/quality-gates.md` 参照）。

## ツール候補

| 用途 | 候補 |
|---|---|
| Unit / Component | Vitest + @testing-library/react + jsdom |
| E2E | Playwright |
| Coverage | Vitest coverage (`@vitest/coverage-v8`) |

`bun test` は使わない（本プロジェクトは npm）。`vitest` を watch モードで放置しない。

## 導入時のチェックリスト

- [ ] `package.json` に `test` / `test:coverage` / `test:e2e` を追加（存在しないコマンドを捏造しない）
- [ ] `vitest.config.ts` / `playwright.config.ts` を追加し、`tsconfig.json` / `eslint.config.mjs` と整合させる
- [ ] `docs/task-list.md` にテスト導入タスクを ID 付きで追加し、完了条件と証拠（coverage % / 件数）を記録する
- [ ] CI（`docs/ops/quality-gates.md`）に gate を追加する
