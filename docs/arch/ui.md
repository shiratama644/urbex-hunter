# UI — M3 Expressive・Leaflet・コンポーネント境界

## デザインシステム（正本: `src/app/globals.css` @theme）

Tailwind CSS **v4** の CSS-first 設定。`tailwind.config.ts` は作らない。

```css
@import "tailwindcss";
@theme {
  /* Tonal palettes */
  --color-m3-primary: #d0bcff; --color-m3-on-primary: #381e72;
  --color-m3-primary-container: #4f378b; --color-m3-on-primary-container: #eaddff;
  --color-m3-secondary: #ffb3b0; /* ... */
  --color-m3-tertiary: #7fd8c4;
  --color-m3-error: #ffb4ab;
  --color-m3-surface: #121016; --color-m3-surface-dim: #0d0b11;
  --color-m3-surface-container: #1e1c24;
  --color-m3-on-surface: #e7e0eb; --color-m3-on-surface-variant: #cbc2d4;
  --color-m3-outline: #958e9e; --color-m3-outline-variant: #49454f;

  /* Shapes */
  --radius-m3-xs: 4px; --radius-m3-sm: 8px; --radius-m3-md: 12px;
  --radius-m3-lg: 16px; --radius-m3-xl: 28px; --radius-m3-xxl: 36px; --radius-m3-full: 999px;

  /* Type scale */
  --text-display-lg: 3.5rem; --text-headline-lg: 2rem; --text-title-lg: 1.375rem;
  --text-body-lg: 1rem; --text-body-md: 0.875rem; --text-label-lg: 0.875rem;

  /* Elevation */
  --shadow-m3-1: 0 1px 2px 0 rgb(0 0 0 / 0.4), 0 1px 3px 1px rgb(0 0 0 / 0.22);
  /* ... m3-2 .. m3-5 */

  /* Motion */
  --ease-m3-standard: cubic-bezier(0.2, 0, 0, 1);
  --ease-m3-emphasized: cubic-bezier(0.05, 0.7, 0.1, 1);
  --ease-m3-spatial: cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

Tailwind ユーティリティは `--color-m3-*` 等から自動生成される（例: `bg-m3-surface-dim` / `text-m3-on-surface` / `rounded-m3-xl` / `shadow-m3-3`）。トークンを勝手にリネームすると大量のクラスが壊れる。

- `html, body { height: 100%; overscroll-behavior: none; }`
- `body { background: var(--color-m3-surface-dim); font-family: "Noto Sans JP", system-ui, ... }`
- Leaflet 上書き: `.leaflet-container { background: #0b0a0f; }`

## レイアウト・レスポンシブ

- `src/app/layout.tsx`: `metadata`（title/description/OGP）+ `viewport`（`themeColor: "#121016"` / `width: device-width` / `viewportFit: cover`）。
- `src/app/page.tsx`: `h-dvh w-full` の全画面。`sr-only` の h1。`revalidate = 86400`。
- **モバイル**: `SpotDetailSheet` は Bottom Sheet（ドラッグで閉じる）。`FilterPanel` はシート。
- **デスクトップ**: `SpotDetailSheet` は左サイドパネル。
- `h-dvh`（dynamic viewport）を維持し、`h-screen` に置き換えない（モバイルのアドレスバー伸縮で崩れる）。

## コンポーネント境界

```
GhostMapApp (Client, 状態親)
├── Search Bar（query / suggestions / suggestOpen）
├── Filter Chips + FilterPanel（genres / prefs / minRating）
├── MapClient (dynamic ssr:false)
│   ├── Leaflet map（CartoDB tile）
│   ├── markerClusterGroup（fearRating で色分け）
│   └── bbox / zoom 通知 → 親
├── SpotDetailSheet（selected / nearby / detailLoading）
├── DisclaimerDialog（初回 LocalStorage 同意）
└── FAB（現在地 / tile 切替）
```

| コンポーネント | 責務 | 禁止 |
|---|---|---|
| `GhostMapApp` | 検索・フィルタ・bbox/zoom/tile・選択・取得 orchestrate（`fetch` + `AbortController` + debounce） | 地図の直接操作（Leaflet API を直接呼ぶ） |
| `MapClient` | Leaflet 初期化・タイル切替・marker 生成・cluster・`onBboxChange` 通知 | `GhostMapApp` の状態を直接書き換える。SSR する |
| `SpotDetailSheet` | 詳細表示・近隣・ドラッグ操作・外部リンク | 地図状態の保持 |
| `FilterPanel` | ジャンル/都道府県/怖さの選択 UI（`facets` から生成） | API 直接呼び出し |
| `DisclaimerDialog` | 初回同意の表示・LocalStorage 永続化 | 同意をスキップ可能にする |

`fearTone()` / `genreEmoji()` は `src/lib/types.ts` が正本。色閾値は `fearTone` の 3.0/3.6/4.2 と `FilterPanel.RATINGS` の `[0,3,3.6,4.2]` で統一（EM1-D）。変更は `globals.css` のパレットと合わせて行う。`FilterPanel` は ESC で閉じ、`GhostMapApp` のサジェストは外側 mousedown + ESC + `role=listbox` で a11y 対応（EM1-D）。

## Leaflet 詳細

- **タイル**: `https://{s}.basemaps.cartocdn.com/{dark_all|light_all}/{z}/{x}/{y}{r}.png`
  - `dark` = Dark Matter、`light` = Positron。`tile` state で切り替える。
- **初期表示**: 日本全域が見える zoom 5 相当。`flyTo` は `flyTarget`（lat/lng/zoom/key）で制御する。
- **bbox 絞り込み**: `bbox && zoom >= 8` の時のみ `GET /api/spots?bbox=...` を送る。pad 0.15 で拡張し `-180..180`/`-90..90` に clamp（EM1-D）。広域での無駄な絞り込み・範囲超過を避ける。
- **クラスタ**: `leaflet.markercluster`（`chunkedLoading: true` + `chunkInterval: 100` / `chunkDelay: 50`）。クラスタバブルは Expressive な円形。個別ピンは `fearRating` の `fearTone`（閾値 3.0/3.6/4.2）で色分け。差分更新（clearLayers 全再構築ではなく added/removed のみ addLayers/removeLayer）で 1500 件の jank を緩和（EM1-D）。
- **SSR 禁止**: `dynamic(() => import("@/components/Map/MapClient"), { ssr:false })`。忘れると `window is not defined`。
- **CSS**: `leaflet/dist/leaflet.css` と `leaflet.markercluster/dist/MarkerCluster.css` を `MapClient` で import する。

## Motion

- `framer-motion` の `AnimatePresence` + `motion`。M3 の `ease-m3-emphasized` / `ease-m3-spatial` を使う。
- Bottom Sheet の spring 展開・ドラッグで閉じる挙動を維持する。長時間の motion で地図操作をブロックしない。

## アクセシビリティ

- `page.tsx` の `sr-only` h1 を維持する。
- `FilterPanel` / `SpotDetailSheet` のフォーカス管理・ESC で閉じる・`aria-label` を維持する。`FilterPanel` は `role=dialog` + `aria-modal` + ESC + フォーカス移動（EM1-D）、`GhostMapApp` のサジェストは `combobox` + `listbox`/`option` + 外側 click + ESC（EM1-D）。
- `globals.css` に `:focus-visible { outline: 3px solid var(--color-m3-primary); outline-offset: 2px; }` を定義し WCAG 2.4.7（Focus Visible）を満たす（EM1-D）。
- `DisclaimerDialog` は同意するまで地図操作をブロックする。フッターの「免責を再表示」で再オープン可能（EM1-D）。
- `layout.tsx` は `maximumScale:1` を除去しピンチズームを許可（WCAG 1.4.4）。
