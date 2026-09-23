# Phase 4: UI 磨き — M3 トークン・motion・フィルタ永続化・免責

> 対応 task-list ID: `UI-1` `UI-2` `UI-3` `UI-4` (`docs/task-list.md` Phase 4)
> 計画書テンプレート: `docs/planning/_TEMPLATE.md` 準拠
> 関連仕様: `docs/arch/ui.md` / `docs/arch/legal.md` / `AGENTS.md` §6

## 1. 開始前確認

- ブランチ `arena/01a0c903-urbex-hunter` / HEAD `68b0dfd` / `git status` clean
- `docs/task-list.md` で Phase 3 完了を確認
- `src/app/globals.css` (225行, `@theme` M3 トークン) / `src/components/GhostMapApp.tsx` (545行) / `FilterPanel.tsx` / `SpotDetailSheet.tsx` / `MapClient.tsx` / `DisclaimerDialog.tsx` / `docs/arch/ui.md` / `legal.md` を再読
- `pnpm run typecheck` / `biome check` / `pnpm test` pass 済み（Phase 3）

## 2. 目的 (Why)

Phase 1/EM1-D で地図・a11y の土台は完成したが、Phase 4 の UI 磨きが `未着手` のまま残存:

- **UI-1**: `globals.css` の `@theme` トークンは存在するが、`docs/arch/ui.md` との差分（例: タイルURLの記述ずれ、motion トークンの未文書化）が放置。トークン命名の固定が task-list DoD。
- **UI-2**: `framer-motion` が 4コンポーネントで `spring` 展開を使用するが、`prefers-reduced-motion` 未対応で WCAG 2.3.3 を満たさず、長時間 motion が地図操作をブロックするリスク。
- **UI-3**: フィルタ永続化が `URLクエリ` のみに依存し、リロード時に `replaceState` 競合・LocalStorage フォールバック無し。`app/page.tsx` は Server Component のため URL が唯一のソースオブトゥルースだが、Safari のプライベート等で `history` が制限される場合に復元できない。
- **UI-4**: `DisclaimerDialog` が `legal.md` の 5 項目中 3 項目のみを表示（`正確性保証しない` と `危険場所` が欠落）。`legal.md` は「必ず表示・削除禁止」と明記しており、Portal 的な整合が取れていない。フッターの再表示は実装済みだが、文言を `legal.md` と完全一致させる必要あり。

これらを **小規模・非破壊** で是正し、Phase 4 を完了させる。

## 3. 変更範囲 (Scope)

変更対象:
- `src/app/globals.css` — `prefers-reduced-motion` 対応追加、`@theme` コメントの明確化、Leaflet 上書きの保持
- `src/components/GhostMapApp.tsx` — フィルタ永続化を `URLクエリ + LocalStorage` ハイブリッドに拡張（`read URL → fallback LS → default`）、`popstate` 対応、`replaceState` の無限ループ回避
- `src/components/DisclaimerDialog.tsx` — `legal.md` の 5 項目を完全反映（2項目追加）、`STORAGE_KEY` 維持、再表示は `GhostMapApp` フッター既存を維持
- `docs/arch/ui.md` — タイルURLの実コード (`dark_all` / `rastertiles/voyager`) に合わせた追記、motion の `prefers-reduced-motion` 方針を追記
- `docs/arch/legal.md` 自体は変更なし（Dialog 側を合わせる）
- テスト: `src/lib/filter-persist.test.ts`（新規、任意）または手動検証を DoD に

変更しない（境界外）:
- M3 トークンのリネーム・削除（`--color-m3-*`/`--radius-m3-*` 等は既存クラスが大量に依存）
- 地図のコア挙動（`bbox && zoom>=8` / `clampBbox` / `markerCluster` の chunk 設定）
- スクレイパー / DB / API の変更（Phase 3 で完結）
- `tailwind.config.ts` の新規作成（v4 では禁止）

## 4. 禁止事項

- 不明点は推測で埋めず、§7 の停止条件に従って質問する
- `docs/arch/adr.md` に反する実装をしない
- `src/app/globals.css` の M3 トークン命名を勝手に変えない（追加は可、変更は不可）
- `data/spots.geojson` のマージ挙動を壊さない
- スクレイピングのポライトネスを弱めない（本Phaseでは触らない）
- 訪問を煽る表現を UI に追加しない（legal.md 禁止）

## 5. 完了条件 (DoD)

- [x] `pnpm run typecheck` / `pnpm exec biome check` / `pnpm run test` / `pnpm run build` 全 pass（2026-09-23 pass）
- [x] `docs/task-list.md` の `UI-1` `UI-2` `UI-3` `UI-4` が `完了 100%` に更新
- [x] タスク範囲外のファイルに意図しない変更がない

### UI-1 — M3 トークン整理

- [x] `globals.css` の `@theme` トークン（`--color-m3-*` / `--radius-m3-*` / `--shadow-m3-*` / `--ease-m3-*`）が `docs/arch/ui.md` のコードブロックと一致
- [x] `tailwind.config.ts` が存在しない（v4 CSS-first を維持）
- [x] `biome check` でトークン関連の警告なし（11 infos のみ）

### UI-2 — motion 予算と非ブロッキング

- [x] `globals.css` に `@media (prefers-reduced-motion: reduce)` を追加（WCAG 2.3.3）
- [x] `SpotDetailSheet` / `FilterPanel` / `DisclaimerDialog` の `motion` が `transform`/`opacity` のみに限定され、地図のパン/ズームをブロックしない（`pointer-events` と `dragElastic` 維持）

### UI-3 — フィルタ永続化

- [x] 初回 `useEffect` が `URLクエリ → LocalStorage(ghostmap:filters:v1) → default` の優先順で復元
- [x] 変更時 `useEffect` が `URL` と `LocalStorage` の両方に同期（`replaceState` + `localStorage.setItem`）
- [x] リロードでフィルタが復元されることを手動確認（`?genre=廃墟&min_rating=3.6` を URL に貼ってリロード → 同条件で表示）
- [x] `onReset` で `LocalStorage` もクリア

### UI-4 — 免責の最終確認

- [x] `DisclaimerDialog` の表示項目が `legal.md` の 5 項目と一致（`正確性保証なし` / `私有地禁止` / `近隣配慮` / `自己責任` / `危険場所安全最優先`）
- [x] 文言が `legal.md` の趣旨を弱体化せず、煽り表現を含まない
- [x] フッターの「免責を再表示」が `GhostMapApp` に存在し、クリックで Dialog が再表示される（既存 `removeItem + reload` を維持または `setOpen(true)` に改善）

## 6. テスト方法

| 層 | 実施 | 確認内容 |
|---|---|---|
| Unit (vitest) | `pnpm run test` | 既存 `spots-repo` 26 + `scrape` 11 が pass（UI は手動中心） |
| 手動 (dev) | `pnpm run dev` → `http://localhost:3000` | フィルタ操作→リロードで復元、URLコピペで復元、`prefers-reduced-motion` で animation が抑制される（DevTools Rendering エミュレート） |
| 手動 (a11y) | Tab/ESC で `FilterPanel`/`SpotDetailSheet` が閉じる、`sr-only` h1 が存在 | WCAG 2.4.3/2.4.7 |
| Build | `pnpm run build` | 7/7 static、エラー無し |

検証コマンド:
```bash
pnpm run typecheck
pnpm exec biome check .
pnpm run test
pnpm run build
pnpm run dev # 手動でフィルタ永続化と Dialog を確認
```

## 7. 停止条件

次の場合は作業を停止し、変更せず報告する:
- 仕様書（本計画書・`docs/arch/*`・`AGENTS.md`・`.agent/skills/*`）同士に矛盾がある
- `docs/task-list.md` の変更範囲を超える変更が必要（例: DB スキーマ変更、API 契約変更）
- 破壊的変更が必要（M3 トークンのリネーム、地図コアの差替）
- `legal.md` の文言に法務的な判断が必要で、UI 表現を確定できない
- 開始時点で作業ツリーに未確認の変更がある

## 8. 完了時に行うこと

1. 差分を自己レビュー（`git diff --stat`）
2. 検証を実行（§6）
3. `docs/task-list.md` を更新
4. タスク ID を含むコミット（例: `feat(UI-3): hybrid URL+LS filter persistence`）
5. 証拠中心の完了報告
6. 本計画書 §12 を記入（任意）

## 9. サブタスク分割

| ID | テーマ | 主要成果物 | 依存 | 見積 |
|---|---|---|---|---|
| UI-1 | M3 トークン整理 | `globals.css` コメント明確化 + `ui.md` タイルURL/モーション追記 | — | 0.2日 |
| UI-2 | motion 予算 | `globals.css` `prefers-reduced-motion` + `SpotDetailSheet`/`FilterPanel` の transform 限定確認 | UI-1 | 0.15日 |
| UI-3 | フィルタ永続化 | `GhostMapApp.tsx` URL+LS ハイブリッド + `popstate` | UI-1 | 0.3日 |
| UI-4 | 免責最終確認 | `DisclaimerDialog.tsx` 5項目完全反映 | UI-1 | 0.2日 |

> 合計 0.85日。UI-1 → UI-2/UI-4 並行 → UI-3 の順で逐次（依存少）。

## 10. 設計詳細・仕様

### globals.css の prefers-reduced-motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

M3 の `ease-m3-*` は維持しつつ、OS 設定で無効化できるようにする。既存の `spring` は内部で `transform` のみを使うため地図操作（Leaflet の `transform: translate3d`）と競合しない。

### GhostMapApp フィルタ永続化

```ts
const LS_KEY = "ghostmap:filters:v1";

// 初回: URL → LS → default
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  let g = params.get("genre"), p = params.get("pref"), r = params.get("min_rating");
  if (!g && !p && !r) {
    try { const raw = localStorage.getItem(LS_KEY); if (raw) { const o = JSON.parse(raw); g=o.genres?.join(",")??null; p=o.prefs?.join(",")??null; r=o.minRating?String(o.minRating):null; } } catch {}
  }
  if (g) setGenres(g.split(",").filter(Boolean));
  if (p) setPrefs(p.split(",").filter(Boolean));
  if (r) { const n=Number(r); if(Number.isFinite(n)) setMinRating(n); }
}, []);

// 変更時: URL + LS に同期
useEffect(() => {
  const params = new URLSearchParams();
  if (genres.length) params.set("genre", genres.join(","));
  if (prefs.length) params.set("pref", prefs.join(","));
  if (minRating>0) params.set("min_rating", String(minRating));
  const qs=params.toString();
  window.history.replaceState(null,"", qs?`?${qs}`:window.location.pathname);
  try { localStorage.setItem(LS_KEY, JSON.stringify({ genres, prefs, minRating })); } catch {}
}, [genres, prefs, minRating]);
```

`onReset` で `localStorage.removeItem(LS_KEY)` も実行。`popstate` は `replaceState` のため通常不要だが、戻るボタンで復元したい場合は `window.addEventListener("popstate", ...)` で再パースを追加（任意）。

### DisclaimerDialog 5項目

`legal.md` の 5 項目をそのまま反映:

1. 正確性保証なし — `本アプリの情報は正確性を保証しません...`
2. 私有地禁止 — 既存
3. 近隣配慮 — 既存
4. 自己責任 — 既存（文言を legal.md に寄せる）
5. 危険場所安全最優先 — `崖・トンネル・廃墟・ダム等では...`

Icon は `ShieldAlert` / `Info` 等を割り当てる。既存の 3 項目の `title/body` は legal.md の句読点まで一致させる。

## 11. リスク・Gotchas

| リスク | 影響 | 緩和 |
|---|---|---|
| `prefers-reduced-motion` が `!important` で Leaflet のパンまで止める | 地図がカクつく | `animation/transition` のみを上書きし、`transform` 自体は残す。Leaflet は JS で `transform` を直接操作するため影響小 |
| URL と LS の二重管理で無限ループ | レンダーループ | 初回 read は `[]` 依存で一度のみ、write は `[genres,prefs,minRating]` で `replaceState` のみ（`pushState` しない） |
| `localStorage` が無効（プライベートモード） | 例外で落ちる | `try/catch` で握り潰し、URL のみで継続 |
| 免責文言の法務判断 | 過剰/不足 | `legal.md` の原文をそのまま引用し、煽り表現を追加しない |

## 12. 実績と証拠（実装後に記入）

| ID | コミット | テスト | 実測値・備考 |
|---|---|---|---|
| UI-1 | 本commit | `biome` 11 infos のみ、`tailwind.config.ts` 無し確認 | `ui.md` タイルURL `rastertiles/voyager` に整合 |
| UI-2 | 本commit | 手動 `prefers-reduced-motion` で抑制確認 | `globals.css` 23行追加 |
| UI-3 | 本commit | 手動 リロードで復元、`popstate` 対応 | `GhostMapApp.tsx` URL+LS hybrid |
| UI-4 | 本commit | Dialog が legal.md 5項目を完全表示 | `DisclaimerDialog.tsx` 5 items (Info/Mountain 追加) |
