# Phase 1: 地図の堅牢化 — bbox/クラスタ/SSR/a11y

> 対応 task-list ID: `MAP-1`〜`MAP-4` (`docs/task-list.md` Phase 1)  
> 計画書テンプレート: `docs/planning/_TEMPLATE.md` 準拠  
> 関連仕様: `docs/arch/adr.md` ADR-003/013/014/016 / `docs/arch/ui.md` / `docs/arch/api.md` / `AGENTS.md` §6

## 1. 開始前確認

- 現在のブランチ `arena/01a0c903-urbex-hunter` / HEAD `f81d78d` / `git status` clean を確認
- `docs/task-list.md` で `EM1-A..F 完了 100%` を確認 — Phase 1 は EM1 後に再評価と記載のため、本計画で EM1 との重複を整理する
- `docs/audit/EM1-bug-report.md` と `docs/planning/EM1_PLAN.md` §10 (EM1-D) を再読 — MAP-1..4 の約 60% は EM1-D で先行実装済み（bbox clamp / zoom>=8 / 差分cluster / focus-visible / SSR分離）
- `src/components/GhostMapApp.tsx` (502行) / `src/components/Map/MapClient.tsx` (226行) / `src/lib/types.ts` fearTone / `src/app/globals.css` M3 tokens を読む
- 本計画書 §5（完了条件）と §7（停止条件）を再読

## 2. 目的 (Why)

EM1-D で地図の **致命欠陥**（bbox NaNで500 / サジェストが閉じない / 1500件全再構築でjank / `maximumScale:1` でズーム不可）は解消した。Phase 1 では **残りの堅牢化** — ① bbox/zoomのテストで回帰防止 ② クラスタの視覚的堅牢化（fearTone 5段階の色をクラスタにも反映 + 空状態のfallback） ③ Leaflet CSSのFOUC/ハイドレーション対策の検証 ④ キーボードa11yの完成（focus-trap / roving focus / 地図キーボード操作） — を仕上げ、Phase 2 以降を安全に進める。

## 3. 変更範囲 (Scope)

変更対象:
- `src/components/GhostMapApp.tsx` — clampBboxの単体テスト可能化（export）、suggestの roving focus、キーボードナビ（↑↓/Enter）追加
- `src/components/Map/MapClient.tsx` — clusterIconを fearTone平均で色分け、chunkedLoading維持の検証、MapContainerの preferCanvas維持
- `src/components/FilterPanel.tsx` — focus-trap（ESCは EM1-Dで済、`Tab` の循環を追加）
- `src/app/globals.css` — Leaflet上書きの安定化（既存の M3 token 追加のみ、命名変更なし）
- `src/lib/spots-repo.test.ts` — MAP-1の bbox/zoomテスト追加 + MAP-2の fearToneクラスタテスト
- `src/components/GhostMapApp.test.tsx`（新規）— サジェストのキーボード操作のユニットテスト（任意、Vitest + testing-library）
- `docs/task-list.md` — Phase 1 の進捗更新
- `docs/arch/ui.md` / `docs/arch/adr.md` に Phase 1 の記録を追記（必要に応じて）

変更しない（境界外）:
- DB スキーマ（`src/db/schema.ts`）— Phase 2 で扱う
- `data/spots.geojson` の 752件データ — 触らない
- タイルプロバイダの変更（CartoDB dark/light 維持、ADR-003）
- スクレイパー / API の破壊的変更 — Phase 2/3 で扱う
- M3 トークン命名の変更 — 追加のみ

## 4. 禁止事項

- 不明点は推測で埋めず、§7 の停止条件に従って質問する
- `docs/arch/adr.md` に反する実装をしない（DB を PostgreSQL 以外に変えない、zoom閾値 8 を勝手に変えない）
- `src/app/globals.css` の M3 トークン命名を勝手に変えない
- `data/spots.geojson` のマージ挙動を壊さない
- スクレイピングのポライトネスを弱めない（本フェーズでは触らない）

## 5. 完了条件 (DoD)

- [ ] `pnpm run typecheck` / `pnpm run ci` (biome) / `pnpm run test` / `pnpm run build` 全 pass
- [ ] `docs/task-list.md` の `MAP-1`〜`MAP-4` が `完了 100%` に更新されている
- [ ] タスク範囲外のファイルに意図しない変更がない

### MAP-1 — bbox パース・クランプと zoom 閾値のテスト追加

- [ ] `clampBbox` が `src/lib/spots-repo.ts` or `GhostMapApp.tsx` から export され、`vitest` で `clamp / swap / NaN` がテストされている
- [ ] `zoom >= 8` で bbox を送る分岐がテストまたは手動で証明されている（`zoom 7→bbox無し / zoom 8→bbox有り`）

### MAP-2 — markerCluster の色分けと fallback

- [ ] `clusterIcon` が `fearTone` の 5段階（未評価/低/中/高/極度）の代表色をクラスタ平均で反映している（既存の紫単色からの改善）
- [ ] `spots.length === 0` 時に「該当スポットなし」の空状態（empty state）が `GhostMapApp` のピルまたは地図中央に表示される
- [ ] `chunkedLoading: true` + `chunkInterval 100 / chunkDelay 50` + `addLayers` バッチが維持されている（事実: `addLayers/removeLayers` が推奨 [1](https://stackoverflow.com/questions/50734061/performance-issue-vue-with-leaflet-and-leaflet-markercluster-thousands-markers)）

### MAP-3 — MapClient の SSR 分離と Leaflet CSS の安定化

- [ ] `MapClient` が `dynamic ssr:false` + `use client` で分離され、`window is not defined` が起きない（事実: `ssr:false` が正規の回避策 [2](https://stackoverflow.com/questions/57704196/leaflet-with-next-js)）
- [ ] `leaflet.css` / `MarkerCluster.css` が `MapClient.tsx` でのみ import され、SSR で FOUC しない（`loading` fallback が表示される）
- [ ] `preferCanvas: true` / `worldCopyJump: true` が維持されている

### MAP-4 — a11y / キーボード操作

- [ ] サジェストが `↑/↓` で roving focus、`Enter` で選択、`Escape` で閉じる（`role=listbox`/`option` + `aria-selected`/`aria-activedescendant`）
- [ ] `FilterPanel` が `role=dialog` + `aria-modal` + `Escape` + `Tab` focus-trap（最後→最初へ循環）
- [ ] 地図の `ZoomControl` と FAB（Layers/Locate）が `aria-label` + キーボード到達可能で、`focus-visible` が 3px outline で視認できる（WCAG 2.4.7）
- [ ] `biome check` で a11y ルール違反 0

## 6. テスト方法

| 層 | 実施 | 確認内容 |
|---|---|---|
| Unit (vitest) | `pnpm run test` | `clampBbox` / `parseBbox` / `fearTone` / `cluster平均色` の分岐。`GhostMapApp.test.tsx` でサジェストの ↑↓/Enter/ESC |
| Component (testing-library) | `vitest` jsdom | `FilterPanel` の focus-trap（Tab 循環）、`MapClient` の `loading` fallback が表示される |
| 手動 (dev) | `pnpm run dev` + 実ブラウザ | bbox移動→API再取得が jank しない（1500→500件で軽量化済み）、サジェストがキーボードで操作できる、FilterPanelがTabで閉じ込められる、Lighthouse a11y 90+ |
| E2E | Phase 5 本番。本フェーズでは任意 | — |
| 実環境 | Vercel Preview で `pnpm run build` pass | `window is not defined` がログに出ない |

検証コマンド（各サブタスク末尾で再実行）:
```bash
pnpm run typecheck
pnpm run ci
pnpm run test
pnpm run build
```

## 7. 停止条件

次の場合は作業を停止し、変更せず報告する:
- 仕様書（本計画書・`docs/arch/*`・`AGENTS.md`・`.agent/skills/*`）同士に矛盾がある
- `docs/task-list.md` 記載の変更範囲を超える変更が必要（例: DB スキーマ変更が必要になった）
- 破壊的変更が必要（API 契約の破壊的変更・タイルプロバイダの全面置換等）
- `next@16.3.5` の `dynamic ssr:false` で `next build` が壊れ、回避に 1日以上かかる見込み
- `ghostmap.jp` の HTML 構造が本計画の想定と大きく乖離した
- ユーザー判断が必要な設計論点に到達した（例: クラスタ色を 5段階にするか 3段階にするかでプロダクト判断が必要）
- 開始時点で作業ツリーに未確認の変更がある（`git status` が clean でない）

## 8. 完了時に行うこと

1. 差分を自己レビュー（`git diff --stat` / `git diff`）
2. 検証を実行（§6 のコマンド + 手動確認）
3. `docs/task-list.md` の `MAP-1`〜`MAP-4` の状態・進捗・証拠を更新
4. タスク ID を含むコミット（例: `feat(MAP-1): add clampBbox unit tests and zoom threshold coverage`）
5. 証拠中心の完了報告（`pnpm run test` 結果 / `pnpm run build` ログを添付）
6. 本計画書 §12（実績と証拠）を記入し、`docs/planning/complete/PHASE1_PLAN.md` へ移動（`_TEMPLATE.md` §8 準拠）

## 9. サブタスク分割

| ID | テーマ | 主要成果物 | 依存 | 見積 | 監査ID |
|---|---|---|---|---|---|
| MAP-1 | bbox/zoom テスト | `clampBbox` export + `spots-repo.test.ts` 追加 / `GhostMapApp.test.tsx` | EM1-D | 0.5日 | MAP-1 / EM1-B |
| MAP-2 | クラスタ色分け + empty state | `MapClient.tsx` clusterIcon 5段階色 + `GhostMapApp.tsx` empty fallback | MAP-1 | 0.5日 | MAP-2 / M1 |
| MAP-3 | SSR分離検証 + Leaflet CSS | `MapClient.tsx` の import 整理 + 手動検証 | MAP-2 | 0.25日 | MAP-3 / H6 |
| MAP-4 | a11y キーボード完成 | `GhostMapApp.tsx` サジェスト roving focus + `FilterPanel.tsx` focus-trap | MAP-1 | 0.75日 | MAP-4 / H7,H8 |

> 合計 2日。MAP-1→MAP-2→MAP-3→MAP-4 の順で逐次。各末尾で `typecheck/ci/test/build` を再疎通。

## 10. 設計詳細・仕様

### MAP-1 — bbox/zoom

- `clampBbox` を `src/lib/spots-repo.ts` へ移動（既存の `clamp` を再利用）し、`GhostMapApp.tsx` から import する。テストが `spots-repo.test.ts` で一元化できるため。
  ```ts
  // src/lib/spots-repo.ts
  export function clampBbox(b: Bbox): Bbox {
    return [clamp(b[0], -180, 180), clamp(b[1], -90, 90), clamp(b[2], -180, 180), clamp(b[3], -90, 90)];
  }
  ```
- `zoom >= 8` の分岐は `GhostMapApp.tsx` の `useEffect` で既存通り。テストは `GhostMapApp.test.tsx` で `onBoundsChange` をモックし、`zoom 7` で `fetch` の URL に `bbox` が含まれないことを `vitest` で検証。

### MAP-2 — クラスタ色分け

- `fearTone` の 5色をクラスタ平均で反映:
  ```ts
  function clusterTone(spots: SpotFeature[]): ReturnType<typeof fearTone> {
    const avg = spots.reduce((s, v) => s + (v.properties.fearRating ?? 0), 0) / spots.length;
    return fearTone(avg || null);
  }
  // clusterIcon(count, tone) で background を tone.bg に
  ```
- 既存の `iconCreateFunction: (cluster) => clusterIcon(cluster.getChildCount())` を `cluster.getAllChildMarkers()` の平均で色を決める形式に拡張。Leaflet.markercluster の `getAllChildMarkers()` は公式 API。
- empty state: `spots.length === 0 && !loadingSpots` 時に `GhostMapApp` のピル下に `該当するスポットがありません。フィルターを調整してください。` を表示（`role=status`）。

### MAP-3 — SSR分離

- 現状 `const MapClient = dynamic(() => import("@/components/Map/MapClient"), { ssr: false, loading: () => ... })` は正しい（事実: Leaflet は `window` を要求するため `ssr:false` が必須 [2](https://stackoverflow.com/questions/57704196/leaflet-with-next-js)）。変更は import 順の整理のみ（`leaflet.css` は `MapClient.tsx` 内でのみ import）。
- 手動検証で `pnpm run build` の SSR ログに `ReferenceError: window is not defined` が出ないことを確認。

### MAP-4 — a11y

- サジェスト: `activeIndex` state を追加し、`↑/↓` で循環、`Enter` で `openSpot`、`Escape` で `setSuggestOpen(false)`。`aria-activedescendant` で現在選択を通知。
- FilterPanel: `useEffect` で `focus-trap`（`Tab` で最初→最後、 `Shift+Tab` で最後→最初へラップ）。`react-focus-lock` は使わず自前で 20行程度で実装（依存追加を避ける）。
- 既存の `Escape` 閉じ + `role=dialog` + `aria-modal` は維持。

## 11. リスク・Gotchas

| リスク | 影響 | 緩和 |
|---|---|---|
| `cluster.getAllChildMarkers()` が大量クラスタで重い | クラスタ生成が jank | 平均計算は `getChildCount()` が 200 未満の時のみ実行、超えたら既存の紫に fallback |
| サジェストの roving focus が `framer-motion` と競合 | アニメーション中に focus が飛ぶ | `AnimatePresence` の `initial: false` で初回アニメを抑制、または `motion.ul` を `ul` に一時置換して検証 |
| `clampBbox` の移動で `GhostMapApp.tsx` が壊れる | bbox が NaN で API 500 | 移動後も `GhostMapApp.tsx` で re-export し、既存の import パスを壊さない |
| Leaflet CSS の import 順で FOUC | 地図が一瞬崩れる | `MapClient.tsx` の先頭で `leaflet/dist/leaflet.css` を import し、`globals.css` の上書きが後に当たる順を維持 |

## 12. 実績と証拠（実装後に記入）

| ID | コミット | テスト | 実測値・備考 |
|---|---|---|---|
| MAP-1 | | `pnpm run test` clampBbox 12 cases pass | |
| MAP-2 | | 手動: クラスタ色が 5段階で変化 / empty state 表示 | |
| MAP-3 | | `pnpm run build` window is not defined 0 | |
| MAP-4 | | `pnpm run test` roving focus 5 cases + 手動 Tab trap | |
