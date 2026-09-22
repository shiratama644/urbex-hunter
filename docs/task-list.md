# タスクリスト（唯一の正本） — urbex-hunter

> 1. 本ファイルが進捗の正本。矛盾時は本ファイル。
> 2. 進行中は原則 1 件。
> 3. タスク ID は再利用しない。中止は「対象外」＋理由。
> 4. 新問題は新タスク。混ぜない。
> 5. 完了は証拠で判定。
> 6. 詳細は `docs/planning/*_PLAN.md`。完了済み計画は `docs/planning/complete/`（`_TEMPLATE.md` 準拠）。
> 7. 仕様の正本は `docs/arch/`。旧仕様は `.archive/`（必要時に作成）。

**状態**: `未着手` / `調査中` / `実装中` / `ローカル検証済み` / `実環境検証待ち` / `完了` / `保留` / `対象外`

---

## プロダクト概要

**全国心霊マップ Explorer 👻** — ghostmap.jp 由来の心霊スポット（752件 / 47都道府県）を、
Next.js (App Router) + PostgreSQL(Drizzle) + Tailwind v4 (M3 Expressive) + Leaflet + markercluster で探索する非公式地図アプリ。
詳細は [`arch/product.md`](./arch/product.md)。ライセンス MIT。免責必須（[`arch/legal.md`](./arch/legal.md)）。

---

## 現行コード（zip 展開直後）

`nextjs-ghost-map-application.zip`（`nextjs-postgresql-template` 由来）の単一パッケージ。`npm` / `next dev` / `tsc --noEmit` / `eslint .` / `next build`。

| 項目 | 状態 | 備考 |
|---|---|---|
| Next.js 16 App Router + React 19 + TypeScript strict | 存在 | `src/app/page.tsx` が Server Component |
| Tailwind v4 + `@theme` (M3 Expressive) | 存在 | `src/app/globals.css` が正本。`tailwind.config.ts` 無し |
| Leaflet + react-leaflet + markercluster (CartoDB) | 存在 | `MapClient` は `dynamic ssr:false` |
| PostgreSQL + Drizzle (spots table) + pg | 存在 | `src/db/schema.ts` が正本 |
| cheerio スクレイパー + seed + GeoJSON (752件) | 存在 | `data/spots.geojson` / `scripts/scrape.ts` |
| 週次 workflow (scrape_update.yml) | 存在 | cron `15 18 * * 0` |
| AGENTS.md / .agent/ / docs/arch/ | **本タスクで導入** | cod-web 型の規約・スキル・仕様索引を移植 |

---

## 目標ロードマップ

計画書は着手前に `docs/planning/PHASE{N}_PLAN.md` を作る。DoD は `docs/arch/adr.md` と各計画書。

| Phase | テーマ | 状態 |
|---|---|---|
| **0** | 基盤導入（zip 展開・AGENTS/.agent/docs 移植・疎通） | 完了（SETUP-0〜5 / `2b2bd43` / `npm run build` pass） |
| **EM1** | **Bug fixes**（監査 P0/P1 全解消 + P2 選別） | 未着手（次フェーズ）— 詳細は [`audit/EM1-bug-report.md`](./audit/EM1-bug-report.md) / [`planning/EM1_PLAN.md`](./planning/EM1_PLAN.md) |
| **1** | 地図の堅牢化（bbox/クラスタ/SSR分離/a11y/パフォーマンス） | 未着手（EM1 後に再評価） |
| **2** | API / DB 強化（facets キャッシュ・近隣・seed 冪等・index） | 未着手（EM1-B で一部先行） |
| **3** | スクレイパー強化（リトライ・差分・重複排除・ポライトネス） | 未着手（EM1-C で一部先行） |
| **4** | UI 磨き（M3 トークン整理・motion 予算・フィルタ永続化・免責） | 未着手（EM1-D で一部先行） |
| **5** | 運用 / 品質（テスト・E2E・監視・workflow 可観測性） | 未着手（EM1-F で土台） |

### Phase 0 — 基盤導入

| ID | タスク | 状態 | 進捗 | 依存 | 完了条件 | 証拠 |
|---|---|---|---:|---|---|---|
| SETUP-0 | zip 展開・プロジェクト保存 | 完了 | 100% | — | `nextjs-ghost-map-application.zip` を解凍し、package.json / src / data / scripts がワークツリーに存在する | 本コミット / `unzip -l` 42 files |
| SETUP-1 | AGENTS.md 導入（cod-web 型を urbex-hunter 用に適合） | 完了 | 100% | SETUP-0 | §6 が Next.js/Leaflet/Drizzle 用に書き換えられ、§3.1 が npm/lint/build に適合している | 本コミット |
| SETUP-2 | .agent/ 導入（hooks/skills を npm 用に適合） | 完了 | 100% | SETUP-1 | `hooks/settings.json` が npm コマンド、skills が Ghost Map 仕様になっている | 本コミット |
| SETUP-3 | docs/ 導入（arch/product/architecture/data-model/api/ui/scraping/adr/legal + task-list/planning） | 完了 | 100% | SETUP-1 | `docs/README.md` / `docs/arch/README.md` が urbex-hunter 仕様で索引として機能する | 本コミット |
| SETUP-4 | README.md 刷新（zip README を保持しつつ docs/AGENTS への導線を追加） | 完了 | 100% | SETUP-3 | ルート README が Ghost Map の使い方と `docs/arch` / `AGENTS.md` へのリンクを両方持つ | 本コミット |
| SETUP-5 | 疎通確認（typecheck / lint / build） | 完了 | 100% | SETUP-0〜4 | `npm run typecheck` / `npm run lint` / `npm run build` が pass（DB 無しでも GeoJSON 経路でビルド） | `npm run build` 752件 pass（`2b2bd43`） |

### Phase EM1 — Bug fixes（監査対応）

> 完全監査は `docs/audit/EM1-bug-report.md`（2026-09-22）。本フェーズで P0（Critical）10件 + P1（High）22件を全解消、P2（Medium）18件を選別対応。L（Low）は任意。
> 各サブフェーズは 1 コミット（`EM1-A`〜`EM1-F`）で区切り、末尾で `npm run typecheck/lint/build` を再疎通。

| ID | タスク | 状態 | 進捗 | 依存 | 完了条件 | 監査ID | 証拠 |
|---|---|---|---:|---|---|---|---|
| EM1-A | パッケージ・設定の是正 | 未着手 | 0% | SETUP-5 | `package.json:name` が `urbex-hunter`、`next@16.3.5` / `drizzle.config.ts` / `images.remotePatterns` / `.env.example` / quality-gates 提案が存在し `npm audit` の critical が 0 | C1,C2,C3,C8,H13,H14,H20,M3,M4,M11 | `npm audit` / `next --version` |
| EM1-B | API / DB / キャッシュの堅牢化 | 未着手 | 0% | EM1-A | `parseBbox` が clamp、`limit/q` が検証、`readGeoJson` がメモ化、`getFacets` が cache、`page.tsx` が `allSettled` + `error.tsx`、rate-limit 雛形 | C4,C5,H1,H2,H3,H4,H5,C7,H22,M5,M6 | `curl /api/spots?bbox=...` / `EXPLAIN` |
| EM1-C | スクレイパーの堅牢化 | 未着手 | 0% | EM1-A | pool 競合解消、`count` 付与、ページネーション、`lat/lng` 3パターン、`th` 前方一致、`https` 化、`og:image` fallback、全角数字/改行保持 | C6,C7,H15,H16,H17,H19,M16,M17,M18 | `npm run scrape -- PREFS=13 LIMIT_PER_PREF=2` ログ |
| EM1-D | 地図・UI/UXの磨き | 未着手 | 0% | EM1-B | bbox clamp（pad）、`openSpot` Abort、サジェスト外側クリック/ESC、cluster 差分更新、`limit` 既定縮小、`maximumScale` 修正、`RATINGS` 統一、`error/loading/not-found` / `sitemap/robots` / フィルタ永続化 | C10,H6,H7,H8,H9,H10,H11,H21,M1,M2,M7,M8,M12,M13,M14 | 手動操作 / Lighthouse a11y |
| EM1-E | ドキュメント・仕様の整合 | 未着手 | 0% | EM1-A | `task-list` の SETUP-5 100% 化、`legal` と Dialog 文言一致、`ui.md`/`product.md` に 500/トークン/座標を明記 | L7,L9,H10,H13,M9,M13 | `docs/arch/*` diff |
| EM1-F | テスト・品質ゲートの土台 | 未着手 | 0% | EM1-B | `vitest` + `testing-library` 導入、`spots-repo` の `parseBbox/filterGeoJson` にユニットテスト、`npm run test` 追加、CI 提案 | M10,M11,H4 | `npm run test` |

### Phase 1 — 地図の堅牢化

| ID | タスク | 状態 | 進捗 | 依存 | 完了条件 | 証拠 |
|---|---|---|---:|---|---|---|
| MAP-1 | bbox パース・クランプと zoom 閾値（`zoom>=8`）のテスト追加 | 未着手 | 0% | SETUP-5 | 不正 bbox で 500 にしない。閾値が adr.md と一致 | |
| MAP-2 | markerCluster の色分け（fearTone）と fallback 表現の整理 | 未着手 | 0% | MAP-1 | 未評価/低/中/高/極度の配色が `globals.css` と一致 | |
| MAP-3 | MapClient の SSR 分離と Leaflet CSS の安定化 | 未着手 | 0% | SETUP-5 | `window is not defined` が起きない。CSS 崩れなし | |
| MAP-4 | a11y / キーボード操作（FilterPanel / DetailSheet / Dialog） | 未着手 | 0% | MAP-3 | ESC で閉じる / フォーカス管理 / aria | |

### Phase 2 — API / DB 強化

| ID | タスク | 状態 | 進捗 | 依存 | 完了条件 | 証拠 |
|---|---|---|---:|---|---|---|
| API-1 | facets キャッシュと N+1 / COUNT 最適化 | 未着手 | 0% | SETUP-5 | `getFacets` の集計が重くない。再検証戦略が adr に記録 | |
| API-2 | 近隣4件の距離計算と除外ロジックのテスト | 未着手 | 0% | API-1 | 同一 spotcd を除外し距離順で4件 | |
| DB-1 | seed の冪等性と advisory lock の検証 | 未着手 | 0% | SETUP-5 | 並列 seed で重複しない | |
| DB-2 | index（pref/genre/bbox）の EXPLAIN 検証 | 未着手 | 0% | DB-1 | `EXPLAIN` で index が効いている | |

### Phase 3 — スクレイパー強化

| ID | タスク | 状態 | 進捗 | 依存 | 完了条件 | 証拠 |
|---|---|---|---:|---|---|---|
| SCR-1 | リトライ・タイムアウト・UA 維持の堅牢化 | 未着手 | 0% | SETUP-5 | 一時失敗で全体が落ちない。UA を維持 | |
| SCR-2 | 座標抽出（`?q=lat,lng` 正規表現）の分岐テスト | 未着手 | 0% | SCR-1 | 正常/異常リンクの両方で落ちない | |
| SCR-3 | GeoJSON マージの重複排除と count 更新 | 未着手 | 0% | SCR-2 | `spotcd` 重複で最新が勝つ。件数が正しい | |

### Phase 4 — UI 磨き

| ID | タスク | 状態 | 進捗 | 依存 | 完了条件 | 証拠 |
|---|---|---|---:|---|---|---|
| UI-1 | M3 トークン（@theme）の整理と命名の固定 | 未着手 | 0% | SETUP-5 | `docs/arch/ui.md` と `globals.css` が一致 | |
| UI-2 | motion 予算と地図操作の非ブロッキング | 未着手 | 0% | UI-1 | 拡大/縮小が motion で妨げられない | |
| UI-3 | フィルタ永続化（URL クエリ / LocalStorage） | 未着手 | 0% | API-1 | リロードでフィルタが復元される | |
| UI-4 | 免責文言の最終確認（legal.md と一致） | 未着手 | 0% | SETUP-5 | `DisclaimerDialog` と `legal.md` が一致 | |

### Phase 5 — 運用 / 品質

| ID | タスク | 状態 | 進捗 | 依存 | 完了条件 | 証拠 |
|---|---|---|---:|---|---|---|
| OPS-1 | 週次 workflow の可観測性（件数ログ / diff / 失敗通知） | 未着手 | 0% | SCR-3 | `scrape_update.yml` のログで件数と差分が分かる | |
| QA-1 | テスト基盤導入（Vitest + Testing Library） | 未着手 | 0% | SETUP-5 | `npm run test` が pass。`docs/arch/testing.md` に記録 | |
| QA-2 | E2E（Playwright）導入と CI gate | 未着手 | 0% | QA-1 | `test:e2e` が CI で実行される。Sandbox では discovery のみ | |

---

## 完了済み

| ID | タイトル | 完了日 | 証拠 |
|---|---|---|---|
| SETUP-0 | zip 展開・プロジェクト保存 | 2026-09-22 | `2b2bd43` / `unzip -l` 42 files |
| SETUP-1 | AGENTS.md 導入 | 2026-09-22 | `2b2bd43` |
| SETUP-2 | .agent/ 導入 | 2026-09-22 | `2b2bd43` |
| SETUP-3 | docs/ 導入 | 2026-09-22 | `2b2bd43` |
| SETUP-4 | README.md 刷新 | 2026-09-22 | `2b2bd43` |
| SETUP-5 | 疎通確認（typecheck/lint/build） | 2026-09-22 | `npm run build` pass |
