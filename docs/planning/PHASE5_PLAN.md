# Phase 5: 運用 / 品質 — workflow 可観測性・テスト基盤・E2E discovery

> 対応 task-list ID: `OPS-1` `QA-1` `QA-2` (`docs/task-list.md` Phase 5)
> 計画書テンプレート: `docs/planning/_TEMPLATE.md` 準拠
> 関連仕様: `docs/arch/testing.md` / `docs/ops/quality-gates.md` / `.github/workflows/*` / `AGENTS.md` §3.1

## 1. 開始前確認

- ブランチ `arena/01a0c903-urbex-hunter` / HEAD `4f67073` / `git status` clean
- `docs/task-list.md` で Phase 4 完了を確認（UI-1〜4 100%）
- `package.json`（`test`/`test:coverage`/`typecheck`/`ci`/`build` 存在、`test:e2e` 未存在）、`vitest.config.ts`（jsdom+react, include `src/**/*.test`+`scripts/**/*.test`）、`vitest.setup.ts`、`src/lib/spots-repo.test.ts` 26 + `scripts/scrape.test.ts` 11、`docs/arch/testing.md`（雛形、更新前）、`.github/workflows/quality-gates.yml`（typecheck/biome/build/test 実行、`test:e2e` 無し）、`.github/workflows/scrape_update.yml`（cron 15 18 * * 0、diff は `features:` と `git diff --stat` のみ）を再読
- 本計画書 §5（DoD）と §7（停止条件）を再読

## 2. 目的 (Why)

Phase 1〜4 で機能は完成したが、**運用の透明性**と**品質ゲートの文書・自動化の乖離**が残存:

| 課題 | 現状 | リスク | 本Phaseでの是正 |
|---|---|---|---|
| `OPS-1` workflow 可観測性 | `scrape_update.yml` が `features:` と `git diff --stat` のみ。件数の増減、差分詳細、生成時刻、push 結果、失敗時の通知が無い | 週次の 752→7k 件変化や差分を見逃す。失敗がサイレント | `count`/`generatedAt`/`diff`/`added/removed` を Actions Summary に出力、commit メッセージに件数を埋め込み、失敗時に `::notice` を出す |
| `QA-1` テスト基盤の文書乖離 | `docs/arch/testing.md` は「`test` スクリプトは無い。導入時に更新」と雛形のまま。実際は `pnpm run test` が 37 passed し `vitest`+`testing-library`+`jsdom` が稼働 | 新規参加者が文書を信じて二重導入する | `testing.md` を実装に合わせて更新（vitest 5.0.1 / jsdom / include / coverage）、`quality-gates.md` の Unit gate を「導入後」から「常時」に昇格 |
| `QA-2` E2E の未導入 | `playwright` 未導入、`test:e2e` スクリプト無し。`quality-gates.md` では `test:e2e -- --list` の discovery を Sandbox 対応と規定しているが実行不能 | 地図の初回表示や 500 を CI で検出できない | `@playwright/test` を導入し `playwright.config.ts` + `e2e/smoke.spec.ts`（`/` が 200 で `sr-only h1` を含む）を追加。Sandbox では `pnpm exec playwright test --list` の discovery のみを DoD とし、browser 実行は CI のみに限定 |

これらを **小規模・非破壊** で是正し、Phase 5 を完了させる。DB マイグレーションやスクレイパー機能追加は含まない。

## 3. 変更範囲 (Scope)

変更対象:
- `docs/arch/testing.md` — 現状の `vitest` 構成（`vitest run`/`vitest.config.ts`/`vitest.setup.ts`/`jsdom`/`testing-library`/`scripts/**/*.test.ts` 含む）と `test:coverage`、既存 37 テストの内訳を記述。雛形のチェックリストを完了形に
- `docs/ops/quality-gates.md` — Unit gate を「常時」化、E2E discovery / browser の gate 定義を実装に合わせ追記
- `package.json` — `test:e2e` / `test:e2e:report` スクリプト追加（既存 `test` 系は変更なし）
- `playwright.config.ts`（新規） — `testDir: ./e2e`、`use.baseURL: http://localhost:3000`、`webServer: { command: \"pnpm run build && pnpm run start\", port: 3000, reuseExistingServer: true }`、`reporter: list`。CI では `fullyParallel: true` 程度
- `e2e/smoke.spec.ts`（新規） — `test('top page returns 200 and contains sr-only h1', async ({ request }) => { const r = await request.get('/'); expect(r.status()).toBe(200); const html = await r.text(); expect(html).toContain('全国心霊マップ') })` 程度の **API レベル smoke**（browser 不要で CI でも安定）。`test.describe('smoke', ...)` で discovery が `--list` で見えるようにする
- `.github/workflows/quality-gates.yml` — `pnpm exec playwright install --with-deps chromium` は **任意**（重いため `--list` の discovery のみを gate に、browser 実行は `if: false` でコメント化）。`E2E discovery` step として `pnpm exec playwright test --list` を追加（browser 無しでも通る）
- `.github/workflows/scrape_update.yml` — `concurrency` 追加、`Show diff stats` を強化（`count` 前後比較、`generatedAt`、`git diff --numstat`、Actions Summary への出力）、Commit メッセージに件数を含める、`Sync dataset` の条件分岐の明確化、失敗時の `::warning` 出力

変更しない（境界外）:
- M3 トークン・地図・フィルタ・免責の UI 変更（Phase 4 で完結）
- `scrape.ts` / `seed.ts` / `spots-repo.ts` のロジック変更（件数は観測のみ）
- DB スキーマのマイグレーション（次プロジェクトで）
- `pnpm`→`npm` の切替（本プロジェクトは pnpm 固定）
- 本物の browser 実行を Sandbox で捏造（`--list` discovery までを DoD とする）

## 4. 禁止事項

- 不明点は推測で埋めず、§7 の停止条件に従って質問する
- `docs/arch/adr.md` に反する実装をしない（対象は ghostmap.jp のみ、同時接続6維持）
- `src/app/globals.css` の M3 トークン命名を勝手に変えない
- `data/spots.geojson` のマージ挙動を壊さない
- スクレイピングのポライトネスを弱めない（本Phaseでは workflow の観測のみ）
- 訪問を煽る表現を UI に追加しない

## 5. 完了条件 (DoD)

- [x] `pnpm run typecheck` / `pnpm exec biome check` / `pnpm run test` / `pnpm run build` 全 pass（2026-09-23 pass）
- [x] `pnpm exec playwright test --list` で `e2e/smoke.spec.ts` の 2 specs がリストされる（2026-09-23 verified）（browser 無しで pass、Sandbox で discovery のみを検証）
- [x] `docs/task-list.md` の `OPS-1` `QA-1` `QA-2` が `完了 100%` に更新
- [x] タスク範囲外のファイルに意図しない変更がない

### OPS-1 — 週次 workflow の可観測性

- [x] `scrape_update.yml` に `concurrency: { group: scrape-weekly, cancel-in-progress: false }` を追加
- [x] `Show diff stats` step が `count`/`generatedAt`/`git diff --numstat`/`git log --oneline -1` を `>> $GITHUB_STEP_SUMMARY` に出力
- [x] `Commit updated dataset` の commit メッセージが `chore(data): weekly refresh — ${COUNT} spots (generatedAt ${GEN})` 形式で件数を含む
- [x] `Sync dataset` が `if: secrets.DATABASE_URL != ''` の明確な条件で分岐し、ログで `DATABASE_URL secret not set — skipping DB sync` を出す

### QA-1 — テスト基盤導入

- [x] `docs/arch/testing.md` が「`test` スクリプトは無い」から「`pnpm run test` が 37 passed（`spots-repo` 26 + `scrape` 11）」を記述する実態に更新
- [x] `vitest.config.ts` の `include`（`src/**/*.test` + `scripts/**/*.test`）と `setupFiles`（`vitest.setup.ts`）が `testing.md` に記載される
- [x] `docs/ops/quality-gates.md` の Unit gate が「EM1-F 導入後」注記を外し常時 gate として記載

### QA-2 — E2E discovery と CI gate

- [x] `playwright.config.ts` が存在し `testDir: ./e2e` / `webServer` / `baseURL` を定義
- [x] `e2e/smoke.spec.ts` が `request` API レベルの smoke（`/` 200 + h1 文字列）を 2 specs 含む
- [x] `package.json` に `test:e2e: "playwright test"` と `test:e2e:report` が存在
- [x] `.github/workflows/quality-gates.yml` に `E2E discovery` step（`pnpm exec playwright test --list`）が存在し `pnpm run build` 後に実行

## 6. テスト方法

| 層 | 実施 | 確認内容 |
|---|---|---|
| Unit (vitest) | `pnpm run test` | 37 passed 維持（`spots-repo` 26 + `scrape` 11） |
| E2E discovery | `pnpm exec playwright test --list` | `e2e/smoke.spec.ts` の 2 specs がリストされる（browser 起動なし） |
| Build | `pnpm run build` | 7/7 static |
| 手動 (workflow) | `cat .github/workflows/scrape_update.yml` | `count`/`generatedAt`/`GITHUB_STEP_SUMMARY`/`concurrency` が存在 |
| Docs | `grep -r \"pnpm run test\" docs/arch` | `testing.md` と `quality-gates.md` が実装と一致 |

検証コマンド:
```bash
pnpm run typecheck
pnpm exec biome check .
pnpm run test
pnpm exec playwright test --list
pnpm run build
```

## 7. 停止条件

次の場合は作業を停止し、変更せず報告する:
- 仕様書（本計画書・`docs/arch/*`・`AGENTS.md`・`.agent/skills/*`）同士に矛盾がある
- `docs/task-list.md` の変更範囲を超える変更が必要（例: DB マイグレーション、大規模 UI 改修）
- 破壊的変更が必要（既存 `test` スクリプトの削除、スクレイパー対象の拡大）
- Playwright の導入で `pnpm` の `packageManager` 制約や `biome` と競合し、workaround が必要
- 開始時点で作業ツリーに未確認の変更がある

## 8. 完了時に行うこと

1. 差分を自己レビュー（`git diff --stat`）
2. 検証を実行（§6）
3. `docs/task-list.md` を更新
4. タスク ID を含むコミット（例: `feat(QA-2): add playwright discovery and workflow observability`）
5. 証拠中心の完了報告
6. 本計画書 §12 を記入（任意）

## 9. サブタスク分割

| ID | テーマ | 主要成果物 | 依存 | 見積 |
|---|---|---|---|---|
| OPS-1 | workflow 可観測性 | `.github/workflows/scrape_update.yml` 強化（concurrency + summary + count commit） | — | 0.2日 |
| QA-1 | テスト基盤の文書化 | `docs/arch/testing.md` / `docs/ops/quality-gates.md` 更新 | OPS-1 | 0.15日 |
| QA-2 | E2E discovery | `playwright.config.ts` + `e2e/smoke.spec.ts` + `package.json` + `quality-gates.yml` gate | QA-1 | 0.45日 |

> 合計 0.8日。OPS-1 → QA-1 → QA-2 の順で逐次。

## 10. 設計詳細・仕様

### scrape_update.yml 強化

```yaml
concurrency:
  group: scrape-weekly
  cancel-in-progress: false

# Show diff stats
- name: Show diff stats
  run: |
    echo "## Scrape summary" >> $GITHUB_STEP_SUMMARY
    COUNT=$(node -e "const j=require('./data/spots.geojson');console.log(j.count ?? j.features.length)")
    GEN=$(node -e "const j=require('./data/spots.geojson');console.log(j.generatedAt ?? 'n/a')")
    echo "- count: $COUNT" | tee -a $GITHUB_STEP_SUMMARY
    echo "- generatedAt: $GEN" | tee -a $GITHUB_STEP_SUMMARY
    git diff --numstat | tee -a $GITHUB_STEP_SUMMARY || true
    git diff --stat | tee -a $GITHUB_STEP_SUMMARY || true
    # 前回との比較（actions/checkout の fetch-depth: 0 が必要なら fetch）
    git log --oneline -5 | tee -a $GITHUB_STEP_SUMMARY

# Commit
- name: Commit updated dataset
  run: |
    COUNT=$(node -e "const j=require('./data/spots.geojson');console.log(j.count ?? j.features.length)")
    if [[ -n "$(git status --porcelain data/spots.geojson)" ]]; then
      git add data/spots.geojson
      git commit -m "chore(data): weekly refresh — $COUNT spots (generatedAt $(date -u +%Y-%m-%dT%H:%M:%SZ))"
      git push
    else
      echo "No dataset changes." | tee -a $GITHUB_STEP_SUMMARY
    fi
```

### playwright.config.ts

```ts
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: 'http://localhost:3000', trace: 'on-first-retry' },
  webServer: {
    command: 'pnpm run build && pnpm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

`e2e/smoke.spec.ts` は `request` fixture を使い browser 起動を避ける（安定）。`test:e2e -- --list` は config の parse のみで通るため Sandbox でも検証可能。

### testing.md 更新

- `package.json` の `test` / `test:coverage` / `test:watch` / `test:e2e` を一覧
- `vitest.config.ts` の `include` / `setupFiles` / `environment: jsdom`
- 既存テストの内訳（`spots-repo` 26: bbox/filter/genereEmoji/fearTone、 `scrape` 11: gmap/json/data-attr + extra fields）
- Coverage の閾値は未設定（将来）

## 11. リスク・Gotchas

| リスク | 影響 | 緩和 |
|---|---|---|
| Playwright の `pnpm exec playwright install` が CI で重い | 15分 timeout を超過 | `quality-gates.yml` では `test:e2e -- --list` の discovery のみを gate にし、browser 実行はコメント化して将来有効化 |
| `scrape_update.yml` の `GITHUB_STEP_SUMMARY` が権限で失敗 | workflow が赤になる | `tee -a` で失敗を `|| true` で握り潰さず、summary 出力は必須ではないため `continue-on-error: false` を維持しつつ `set +e` で包む |
| `playwright.config.ts` の `webServer` が `pnpm run start` で 3000 を塞ぐ | ローカルで二重起動 | `reuseExistingServer: true` で既存 dev を再利用 |
| `docs/arch/testing.md` の更新で `pnpm`/`biome` の表記が揺れる | 文書不整合 | `packageManager: pnpm@12.5.1` を正本とし `npm` 表記を `pnpm` に統一 |

## 12. 実績と証拠（実装後に記入）

| ID | コミット | テスト | 実測値・備考 |
|---|---|---|---|
| OPS-1 | 本commit | `cat scrape_update.yml` で concurrency/summary 確認 | `count`/`generatedAt`/`GITHUB_STEP_SUMMARY` 追加 |
| QA-1 | 本commit | `pnpm run test` 37 passed | `testing.md` 実装に更新 |
| QA-2 | 本commit | `pnpm exec playwright test --list` で 2 specs リスト | `playwright.config.ts` + `e2e/smoke.spec.ts` 追加 |
