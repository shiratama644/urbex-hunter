# Hook: Verify Before Commit（commit 直前検証）

> **トリガー**: 実装が終わり、Git Commit する直前。
> **目的**: AGENTS.md §3.1 の検証を必ず全 pass させてから commit する。途中の検証失敗で次へ進んではならない。

## 検証（順に実行、1 つでも失敗したら原因特定→修正→再全検証）

```bash
npm run typecheck              # tsc --noEmit
npm run lint                   # eslint . （flat config）
npm run build                  # next build
# テストが導入されている場合のみ
npm run test 2>/dev/null || echo "no test script yet"
```

### 各コマンドの注意

- **typecheck**: `tsc --noEmit`。strict 構成。`SpotFeature` / `SpotProperties` の nullable に注意。`tsconfig.json` の `paths: { "@/*": ["./src/*"] }` を壊さない。
- **lint**: `eslint .`。`eslint.config.mjs` の `globalIgnores`（`.next/**` / `out/**` / `next-env.d.ts`）を維持する。`files.includes` 的な誤った除外を足さない。
- **build**: `next build`。成果物は `.next/`。Tailwind v4 / Leaflet を含むため chunk 警告が出たら `next.config.ts` ではなく設計で解消する。
- **test**: `package.json` に `test` が無い間は捏造しない。導入時は `docs/arch/testing.md`（または `docs/arch/README.md`）に配置とコマンドを記録する。
- **ドキュメントのみ変更時**: 上記はスキップ可（AGENTS.md §3.1）。代わりに「リンク切れ・他ファイルとの参照整合・旧名称の残存がないこと」を grep 等で確認する。

## 追加確認（commit 前）

```bash
git status
git diff                       # 意図しないファイル/差分が無いか
```
- タスク範囲外のファイルが混ざっていないか確認する。
- `data/spots.geojson`（931KB / 752件）を変更した場合は、件数・bbox・重複 `spotcd` の簡易検証（`node -e "JSON.parse(...).features.length"` 等）を残す。
- `.archive/` 等のアーカイブを置いている場合は、それがビルド/lint/テストの対象外であることを確認（AGENTS.md §4.5）。

## 検証失敗時の原則（AGENTS.md §3.2）

- テストを通すためだけの**不正な修正厳禁**（テスト削除/skip・アサーション緩和・安易な `any`・Lint 無効化・エラー握り潰し）。
- 既存テスト／API 契約が落ちたら「テストが間違っている」と即断せず、**既存仕様を壊していないか**先に確認。

## E2E / 実 scrape について

- `npm run test:e2e`（Playwright）は **Sandbox では実行不可**（Chromium install 不可）。CI（GitHub Actions）でのみ。
- `npx tsx scripts/scrape.ts` の全量実行（全47都道府県）も Sandbox では推奨しない。`PREFS=13` / `LIMIT_PER_PREF=5` 等の少量で検証する。commit 前検証には**含めない**。

## 完了後

検証 all pass（または docs-only 時の整合性確認）を確認 → commit（Conventional Commits、タスク ID をスコープに）→ `git push origin <session-branch>`（AGENTS.md §4.3.1 で事前許可済み）。
