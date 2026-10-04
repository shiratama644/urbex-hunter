# Architecture — レイヤー・依存規則

## レイヤー

```
[Data Layer]  data/spots.geojson  ←→  scripts/scrape.ts  →  scripts/seed.ts  →  PostgreSQL (spots)
                                                ↓ cron
                                    .github/workflows/scrape_update.yml

[API Layer]   src/app/api/spots/route.ts        (GET /api/spots  bbox/genre/pref/...)
              src/app/api/spots/[id]/route.ts   (GET /api/spots/:spotcd + 近隣4件)
              src/app/api/facets/route.ts       (GET /api/facets  集計)
              src/app/api/health/route.ts       (GET /api/health)

[Lib / DB]    src/lib/types.ts                  (SpotFeature / SpotFacets / GENRE_EMOJI / fearTone)
              src/lib/spots-repo.ts             (querySpots / getFacets / ensureSeeded / tableReady)
              src/db/schema.ts                  (spots pgTable)
              src/db/index.ts                   (drizzle + pg Pool)

[UI Layer]    src/app/layout.tsx                (RootLayout / metadata / viewport / globals.css)
              src/app/page.tsx                  (Server Component: querySpots + getFacets → GhostMapApp)
              src/components/GhostMapApp.tsx    (Client: 状態親 / Search / Filter / FAB / 取得 orchestrate)
              src/components/Map/MapClient.tsx  (Client dynamic ssr:false: Leaflet + markercluster)
              src/components/SpotDetailSheet.tsx (Bottom Sheet / Side Panel)
              src/components/FilterPanel.tsx
              src/components/DisclaimerDialog.tsx

[Style]       src/app/globals.css               (@theme M3 tokens / Tailwind v4 / Leaflet overrides)
```

## 依存規則

```
UI (GhostMapApp)  ──→  Lib (types / spots-repo types)
       ↓                      ↑
    MapClient  ─────→  Lib
       ↓
    Leaflet (client only)

API Routes  ──→  Lib (spots-repo)  ──→  DB (drizzle / pg)
     ↓
   GeoJSON fallback (data/spots.geojson)

Scripts (scrape/seed)  ──→  Lib Types / DB Schema / data/spots.geojson
       ↓
   cheerio / pg

UI は DB を直接 import しない。API 経由か、page.tsx の Server Component 経由のみ。
MapClient は window 前提のため `dynamic ssr:false` を必須とし、他コンポーネントから Leaflet を直接 import しない。
`src/lib/types.ts` は全レイヤーが参照できる共通型。循環参照を作らない。
```

## リポジトリ

単一パッケージ（monorepo ではない）。`package.json` の `scripts` が正本。

```
.
├── src/            # アプリ本体（app / components / db / lib）
├── data/           # GeoJSON（大容量だが Git 追跡する。差分は週次 scrape で更新）
├── scripts/        # スクレイパー / seed（tsx で実行）
├── .github/        # workflows（scrape_update.yml）
├── docs/           # 仕様・計画・進捗
└── .agent/         # Agent スキル・フック・ログ
```

将来的に `packages/` へ分割する場合は ADR で合意してから（本プロジェクトでは当面不要）。

## Server / Client 境界

| 場所 | 種別 | 責務 |
|---|---|---|
| `src/app/page.tsx` | Server | `querySpots({limit:2000})` + `getFacets()` を `Promise.all` で取得し、`GhostMapApp` に渡す。`revalidate = 86400` |
| `src/lib/spots-repo.ts` | Server | DB / GeoJSON からの取得・集計・seed。`tableReady` / `ensureSeeded` のフォールバックを持つ |
| `GhostMapApp` | Client | 検索クエリ・フィルタ・bbox/zoom・選択状態・取得 orchestrate（`fetch` / `AbortController`） |
| `MapClient` | Client (ssr:false) | Leaflet 初期化・タイル切替・markercluster・bbox 通知。状態は親から props で受け取る |
| `SpotDetailSheet` | Client | 詳細表示・ドラッグ操作。近隣は `fetch /api/spots/[id]` で取得 |

**原則**: 地図の状態（bbox/zoom/tile）は `GhostMapApp` が保持し、`MapClient` は表示に専念する。DB 直結を Client からしない。

## エイリアス

`tsconfig.json` の `paths: { "@/*": ["./src/*"] }` を使う。`@/components/...` / `@/lib/...` / `@/db/...` を維持する。相対パスへの無秩序な置換をしない。
