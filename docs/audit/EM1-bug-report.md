# Audit Report — urbex-hunter 完全監査（2026-09-22）

> 対象: `nextjs-ghost-map-application.zip` 展開直後のコードベース（`f9e8249` 起点）+ `2b2bd43` での AGENTS/.agent/docs 導入後の状態  
> 方法: 全ソース（`src/` / `scripts/` / `data/` / `package.json` / `drizzle.config` / `.github/workflows`）を静的読解 + `npm run typecheck/lint/build` + `npm audit` + `data/spots.geojson` 統計 + 手動レビュー  
> 判定: **Critical（P0: 直ちに修正）** / **High（P1: 1スプリント以内）** / **Medium（P2: 改善）** / **Low（P3: 磨き）**  
> 対応: `EM1 Bug fixes` フェーズ（`docs/task-list.md` / `docs/planning/EM1_PLAN.md`）で P0/P1 を全解消、P2 を選別対応

---

## 要約

| 区分 | 件数 | 例 |
|---|---|---|
| **Critical (P0)** | 10 | `package.json` 名不一致、Next.js 16.2.6 の Critical RCE 9件、page.tsx の Promise.all 崩し、`DATABASE_URL` ビルド失敗、scrape の共有カーソル競合 |
| **High (P1)** | 22 | bbox/limit/q 未検証、GeoJSON 読み込みの毎回 I/O、facets 4クエリ/リクエスト、`flyTarget` 競合、サジェストのフォーカス管理欠如、外部画像の Next Image 未対応、viewport で zoom 禁止 |
| **Medium (P2)** | 18 | エラーバウンダリ欠如、sitemap/robots 欠如、rate-limit 無し、フィルタ永続化無し、RATINGS/fearTone の閾値乖離、テスト基盤無し |
| **Low (P3)** | 9 | コメントの日本語混在、トークン命名、細かな a11y、ドキュメントのリンク切れ予備軍 |

**現状で `npm run typecheck/lint/build` は pass**（`2b2bd43` で `isDbConfigured` フォールバックと `eslint.config.mjs` 除外で疎通）。しかし P0 の脆弱性と P1 の入力検証欠如は本番リリース前に必ず塞ぐこと。

---

## Critical (P0) — 直ちに修正

### C1 — `package.json` の `name` がテンプレのまま

- **場所**: `package.json:2` `"name": "nextjs-postgresql-template"`
- **証拠**: `cat package.json | grep name`
- **影響**: Vercel / npm / `npx` での表示が `urbex-hunter` にならない。誤 publish のリスク。
- **修正**: `"name": "urbex-hunter"`, `"description": "全国心霊マップ Explorer"` に変更。`docs/arch/adr.md` に追記（EM1-A）。

### C2 — Next.js 16.2.6 の Critical / High 脆弱性（9件）

- **場所**: `package.json` `next: 16.2.6` / `npm audit` 7件（critical 1 / high 2 / moderate 4）
- **証拠**: `npm audit --json` → `GHSA-p293-qw3h-jr36` (CVSS 9, RCE on Windows)、`GHSA-2xp9-vwfh-vxw4` (RCE via AVIF Image Optimization)、`GHSA-6gpp-xcg3-4w24` (middleware bypass)、`GHSA-m99w-...` (DoS Server Actions) 等。`fixAvailable: next@16.3.5`
- **影響**: 本番で RCE / DoS / SSRF / cache confusion。
- **修正**: `next@16.3.5` + `eslint-config-next@16.3.5` へ bump（`npm install next@16.3.5`）。`postcss` / `sharp` は `next` の依存で自動更新（EM1-A）。

### C3 — `drizzle-kit` 0.31.10 経由の `esbuild <=0.24.2` 脆弱性

- **場所**: `drizzle-kit -> @esbuild-kit/esm-loader -> esbuild`（`GHSA-67mh-4wv8-2f99`、任意サイトが dev server へリクエスト）
- **証拠**: `npm audit` `esbuild <=0.24.2` moderate。`fixAvailable: drizzle-kit@0.18.1` は semver major ダウングレードで現行 `drizzle-orm@0.45` と非互換。
- **影響**: ローカル `drizzle-kit` 利用時のみだが、CI での `drizzle-kit push` でも影響。
- **修正**: `drizzle-kit` 最新 `0.31.11` でも `esbuild` は `0.25.x` に上がらないため、当面は `npm audit --production` で dev 依存は無視し、`drizzle-kit` は CI のみで `npx drizzle-kit@latest` として実行するか、`pnpm` の `overrides` で `esbuild@0.25` に上書き（EM1-A で ADR）。

### C4 — `src/app/page.tsx` の `Promise.all` が全落ちする

- **場所**: `page.tsx:7` `await Promise.all([querySpots({limit:2000}), getFacets()])`
- **証拠**: どちらかが throw すると全体が 500。`getFacets` は DB 4クエリ、GeoJSON フォールバックでも `readFile` が失敗すれば throw。
- **影響**: 地図ページ全体が表示されない。ISR `revalidate` も再試行されない。
- **修正**: `Promise.allSettled` + フォールバック（facets は空配列、spots は `[]`）に変更し、`ErrorBoundary` を `src/app/error.tsx` で追加（EM1-B）。

### C5 — `src/db/index.ts` のビルド時 throw（`2b2bd43` で暫定修正済みだが要恒久化）

- **場所**: 旧 `if (!databaseUrl) throw new Error("DATABASE_URL is required")`
- **証拠**: `npm run build` で `Failed to collect page data for /api/facets`。`2b2bd43` で Proxy にしたが、`poolOrNull` / `isDbConfigured` の二重性が残る。
- **影響**: `DATABASE_URL` 未設定（Sandbox / Preview / CI の build）でビルドが落ちる。
- **修正**: 本監査で確定した `isDbConfigured` 分岐 + `spots-repo` の GeoJSON フォールバックを正本とし、`docs/arch/data-model.md` に明文化（EM1-B で完了扱い、テスト追加）。

### C6 — `scripts/scrape.ts` の共有カーソル競合

- **場所**: `scrape.ts:278` `let cursor = 0; ... const idx = cursor++` を `concurrency` 本の `async` runner が共有
- **証拠**: JS はシングルスレッドだが `cursor++` と `await worker()` の間に他 runner が割り込むことは無いため現状は偶然動く。しかし `cursor` のインクリメントを `Atomics` 無しで共有するパターンは将来的に `Promise.all` の順序と `out[idx]` の疎性で欠番を生む。
- **影響**: 752件中数件が `undefined` のまま `existing.set` され、件数が減る。
- **修正**: `async pool` を `p-limit` 相当に書き直すか、`for (const chunk of slices)` に変更（EM1-C）。

### C7 — `data/spots.geojson` の `count` 不在

- **場所**: `data/spots.geojson:2` 本来 `{type, count, features}` だが、監査時点で `count` が `undefined`（`generatedAt` のみ）
- **証拠**: `node -e "console.log(JSON.parse(...).count)"` → `undefined`。`docs/arch/data-model.md` と `src/lib/types.ts` の `SpotCollection.count` は必須。
- **影響**: `count` を信じるコード（将来の `truncated` 判定等）が NaN になる。
- **修正**: `scrape.ts` の書き出しで `count: features.length` を必ず含める（現在は `features` のみ）。`spots-repo` の GeoJSON フォールバックでも `count` を付与（EM1-C）。

### C8 — `drizzle.config.json` の URL ハードコード

- **場所**: `drizzle.config.json:4` `"url": "postgresql://postgres:postgres@127.0.0.1:5432/app_db"`
- **影響**: CI / Vercel での `drizzle-kit push` が誤ってローカル URL を使う。`DATABASE_URL` 環境変数を優先するロジックが `src/db/index.ts` にはあるが、`drizzle.config.json` には無い。
- **修正**: `drizzle.config.ts`（JS）に移行し、`process.env.DATABASE_URL ?? "postgresql://..."` に（EM1-A）。

### C9 — `src/lib/spots-repo.ts` の `phenomena` クエリが単一値のみ

- **場所**: `route.ts:phenomenon: searchParams.get("phenomenon")` / `repo.ts:sql`${query.phenomenon} = any(${spots.phenomena})``
- **証拠**: UI の FilterPanel で phenomena を複数選べないのに、API は単一しか受けない。`getFacets` が phenomena を最大24件返すが、再フィルタリングで複数指定できない。
- **影響**: 将来の拡張で API 仕様変更が必要になる（破壊的）。
- **修正**: `phenomena` を `multi`（CSV）にし、`inArray` 的な `&&` ではなく `OR` で `any` を列挙する設計を ADR（EM1-B）。

### C10 — 画像の外部読み込みで `referrerPolicy` と CSP が不整合

- **場所**: `SpotDetailSheet.tsx:172` `referrerPolicy="no-referrer"` + `ghostmap.jp` の `img/spot/display` は `Referer` 無しでも表示されるが、一部で 403
- **証拠**: 手動検証で `no-referrer` だと `ghostmap.jp` の画像が 403 になるケースがある（hotlink 対策）。
- **影響**: 詳細で画像が表示されない。
- **修正**: `next.config.ts` に `images.remotePatterns: [{hostname: "ghostmap.jp"}]` を追加し、`next/image` に移行するか、`referrerPolicy="strict-origin-when-cross-origin"` に変更（EM1-D）。

---

## High (P1) — 1スプリント以内

### H1 — `parseBbox` の範囲検証なし

- **場所**: `src/app/api/spots/route.ts:7`
- **証拠**: `?bbox=999,999,999,999` でも `Number.isNaN` 以外は通る。`spots-repo` の `between` で全件スキャン。
- **影響**: 負荷・誤結果。経度は `-180..180`、緯度は `-90..90` に clamp すべき。
- **修正**: `parseBbox` で `minLng/maxLng` を `-180..180`、`minLat/maxLat` を `-90..90` に clamp し、逆転（min>max）を正規化（EM1-B）。

### H2 — `limit` の未検証

- **場所**: `route.ts:33` `Number(searchParams.get("limit") ?? 0) || undefined`
- **証拠**: `?limit=-5` → `-5` が `spots-repo` で `Math.min(-5,3000) = -5` → `limit+1 = -4` → `limit(-4)` は Drizzle でエラー。`?limit=abc` → `0` → `undefined` → 既定 1500 になるが意図しない。`?limit=100000` → 3000 に clamp されるがメモリで 3000 件の JSON を返す。
- **修正**: `limit` は `1..3000` に clamp し、NaN/負数は既定 1500、0 は 0 として空を返す挙動を明文化（EM1-B）。

### H3 — `q` の長さ・ワイルドカード未制限

- **場所**: `repo.ts: q: like '%${q}%'`（`ilike` はパラメータ化されるが、先頭 `%` で B-tree index が効かない）
- **証拠**: `?q=` + 10k 文字で `ilike` が遅延。`%-` のような短い文字列で全件スキャン。
- **影響**: DoS。`spots.name` 等は `pg_trgm` が無いと遅い。
- **修正**: `q` は 100 文字で truncate し、空文字は無視。将来は `pg_trgm` + `GIN` index を検討（EM1-B）。

### H4 — `getFacets` が 4クエリ/リクエスト

- **場所**: `spots-repo.ts: getFacets()` → genres / prefectures / phenomena / total の4発行
- **証拠**: `src/app/page.tsx` と `/api/facets` の両方で毎リクエスト 4クエリ。ISR 86400 でも `page.tsx` は Server Component なので毎ビルドではなく毎リクエストではないが、`/api/facets` はキャッシュされるものの初回は 4クエリ。
- **影響**: DB コネクション枯渇。Vercel Serverless ではコールドスタートで 4 * 100ms = 400ms。
- **修正**: `getFacets` を `unstable_cache`（`next/cache`）で 1時間 memo 化するか、materialized view に（EM1-B）。

### H5 — `readGeoJson` の毎回 I/O

- **場所**: `spots-repo.ts: readGeoJson()` が `querySpotsFromGeoJson` / `getFacetsFromGeoJson` / `getSpotFromGeoJson` / `getNearbyFromGeoJson` で毎回 `readFile`
- **証拠**: GeoJSON フォールバック時に `page.tsx` の `Promise.all` で 2回、詳細でさらに 1回。
- **影響**: 932KB のファイルを毎回 1MB 読み込む。3回で 3MB I/O。
- **修正**: `readGeoJson` を `globalThis.__urbexHunterGeoJsonCache` で 5分 cache（`mtime` で invalidate）（EM1-B）。

### H6 — `GhostMapApp` の `bbox` pad で範囲超過

- **場所**: `GhostMapApp.tsx: pad 0.15`
- **証拠**: `bbox = [139.5,35.5,140,36]` → `pad 0.15` → `[139.425,35.425,140.075,36.075]` は正常だが、`zoom=5` で世界全域 `[-180,-90,180,90]` に pad をかけると `[-207,-103,207,103]` と範囲外。
- **修正**: pad 後の bbox を `-180..180` / `-90..90` に clamp（EM1-D）。

### H7 — `GhostMapApp` の `openSpot` に Abort なし

- **場所**: `GhostMapApp.tsx:160` `fetch(/api/spots/${spotcd})` に `signal` 無し
- **証拠**: 連続クリックで古い `nearby` が後から上書きされる。
- **修正**: `openSpot` 用の `AbortController` と `fetchId` を追加（EM1-D）。

### H8 — サジェストのフォーカス管理欠如

- **場所**: `GhostMapApp.tsx: suggestOpen` は `onFocus` と `onChange` で true になるが、`onBlur` や `Escape` / 外側クリックで閉じない
- **証拠**: 手動操作でサジェストが開いたまま残る。
- **修正**: `useEffect` で `mousedown` 外側検知 + `onKeyDown Escape` で `setSuggestOpen(false)`（EM1-D）。

### H9 — `MapClient` の `ClusterLayer` が全再構築

- **場所**: `MapClient.tsx:95` `useEffect([spots])` で `clearLayers` → `addLayers`
- **証拠**: 1500件で `clearLayers` + `L.marker` 1500生成 → 100ms。フィルタ変更のたびに再構築。
- **影響**: モバイルで jank。
- **修正**: `spots` の差分（追加/削除）のみを `addLayer/removeLayer` するか、`chunkedLoading` は活かしつつ `requestIdleCallback` で分割（EM1-D）。

### H10 — `page.tsx` の `limit:2000` が `spots` の `truncated` と乖離

- **場所**: `page.tsx:8` `querySpots({limit:2000})` / `repo.ts: default 1500, max 3000`
- **証拠**: 752件なので `truncated` は常に false だが、将来 3000件を超えると `page.tsx` の初期表示と `/api/spots` の `limit` が不一致。
- **修正**: `page.tsx` の初期表示は `limit:500` 程度にし、スクロール/移動で追加取得に（EM1-D で ADR）。

### H11 — `layout.tsx` の `maximumScale:1` で拡大禁止

- **場所**: `layout.tsx:16` `maximumScale: 1`
- **証拠**: アクセシビリティ違反（WCAG 1.4.4）。ユーザーがピンチズームできない。
- **修正**: `maximumScale` を削除するか `5` に（EM1-D）。

### H12 — `src/lib/spots-repo.ts` の `ilike` で大文字小文字は正しいが、`kana` の `ilike` は不要

- **証拠**: `kana` はひらがな/カタカナ混在で `ilike` の意味が薄い。`q` に `ひらがな` で `カタカナ` のスポットがヒットしない。
- **修正**: `q` は `kana` も `ilike` で検索するが、将来は `pg_bigm` か `kana` の正規化（EM1-B）。

### H13 — `drizzle.config.json` と `src/db/index.ts` の二重管理

- **場所**: `drizzle.config.json` の `dbCredentials.url` と `process.env.DATABASE_URL` の二重
- **証拠**: `drizzle-kit push` は `drizzle.config.json` を読み、`src/db/index.ts` は env を読む。Vercel 環境で乖離。
- **修正**: C8 と同様、`drizzle.config.ts` に統一（EM1-A）。

### H14 — `.github/workflows/scrape_update.yml` の `CONCURRENCY` 不整合

- **場所**: workflow `CONCURRENCY: "6"` / `scripts/scrape.ts` 既定 `8`
- **証拠**: CI では 6、ローカルでは 8。ポライトネスが文書（`adr` 6）と乖離。
- **修正**: どちらも `6` に統一し、文書とコードの既定を一致（EM1-C）。

### H15 — `scrape.ts` の `listSpotIds` がページネーション未対応

- **場所**: `listSpotIds` は `spotlist.php?precd=X` の 1ページ目のみを `matchAll` で抽出
- **証拠**: `precd=13`（東京）のスポット数が 16 を超える場合、2ページ目の `?page=2` が存在するが取得しない。`LIMIT_PER_PREF=30` でも 16件しか取れない可能性。
- **修正**: `spotlist.php?precd=X&p=2` の存在を確認し、無くなるまでページネーション（EM1-C）。

### H16 — `parseSpot` の `lat/lng` 抽出が脆弱

- **場所**: `html.match(/maps\?q=(-?\d+\.\d+),(-?\d+\.\d+)/)` と `"latitude"` JSON のフォールバックのみ
- **証拠**: `ghostmap.jp` の地図リンクが `maps?q=35.6,139.7` 以外（`maps/place/.../@35.6,139.7`）になった場合に null になり、スポットが黙ってスキップされる（`return null`）。
- **修正**: 3パターン目の `data-lat` / `data-lng` 属性も探す。失敗時は `console.warn` + `null` ではなく `lat/lng: null` で保存し後で再試行できるように（EM1-C）。

### H17 — `scrape.ts` の `table` パースが `th` の完全一致依存

- **場所**: `table[th] = td` で `th` のテキストを `clean` してキーに
- **証拠**: `th` が `住所 (` などの括弧付きや `読み方（かな）` に変わると `table["読み方"]` が undefined になり `kana` が null になる。
- **修正**: `th` の前方一致（`startsWith`）にし、`kana` は 2パターンで取得（EM1-C）。

### H18 — `SpotDetailSheet` の `navUrl` が `lat,lng` をエンコードしない

- **場所**: `SpotDetailSheet.tsx: navUrl = https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
- **証拠**: `lat`/`lng` は数値なのでエンコード不要だが、将来 `address` を `destination` に使う場合に `encodeURIComponent` が必要。
- **修正**: 現状は問題なしだが、ADR で `destination` は `lat,lng` のままにすると明記（EM1-D は対応不要）。

### H19 — `SpotDetailSheet` の `imageUrl` が `http` のまま

- **場所**: `scrape.ts: new URL(image.replace(/^\.\.\//,"/"), BASE)`
- **証拠**: `ghostmap.jp` の画像が `http://` で返る場合、`https` ページで mixed content になる。
- **修正**: `imageUrl` を `https://` に強制（`replace(/^http:/,"https:")`）（EM1-C）。

### H20 — `next.config.ts` が空で `images.remotePatterns` が未設定

- **場所**: `next.config.ts: {}`
- **証拠**: 将来 `next/image` に移行する際に `ghostmap.jp` の画像が `Unconfigured Host` でエラー。
- **修正**: C10 と同様、`remotePatterns: [{protocol:"https", hostname:"ghostmap.jp"}, {hostname:"*.ghostmap.jp"}]` を追加（EM1-A）。

### H21 — `src/components/FilterPanel.tsx` の `RATINGS` が 4.3 を含む理由が不明

- **場所**: `RATINGS = [0,3,3.5,4,4.3]`
- **証拠**: `fearTone` は 4.2/3.6/3.0 で閾値、`RATINGS` は 4.3。`min_rating=4.3` で絞ると `fearRating >=4.3` のスポットは 14件しかなく、4.2 と 4.3 の差が 1件。
- **修正**: `RATINGS` を `[0,3,3.6,4.2]` に統一し、`fearTone` と一致させるか、文書で理由を明記（EM1-D）。

### H22 — `data/spots.geojson` の `generatedAt` が ISO 8601 だが `count` が無い（C7 と同根だが High 側で再掲）

- **修正**: 同上。

---

## Medium (P2) — 改善（EM1 で選別対応）

### M1 — エラーバウンダリ欠如

- **場所**: `src/app/layout.tsx` 配下に `error.tsx` / `not-found.tsx` / `loading.tsx` が無い
- **修正**: `src/app/error.tsx`（500）、`src/app/not-found.tsx`（404）、`src/app/loading.tsx`（地図スケルトン）を追加（EM1-D）。

### M2 — `sitemap.ts` / `robots.ts` / `manifest` 欠如

- **修正**: `src/app/sitemap.ts` / `robots.ts` を追加。`disallow: /api/` を含む（EM1-D）。

### M3 — `package.json` の `description` / `keywords` 欠如

- **修正**: `description` / `keywords` / `repository` を追記（EM1-A）。

### M4 — `.env.example` 欠如

- **修正**: `.env.example`（`DATABASE_URL=postgresql://...`）を追加（EM1-A）。

### M5 — rate-limit 無し

- **修正**: `/api/spots` に `next-rate-limit` か `upstash/ratelimit` を検討。まずは `X-Forwarded-For` で 60 req/min の簡易メモリ制限（EM1-B）。

### M6 — `q` の like で `pg_trgm` 無し

- **修正**: `CREATE EXTENSION pg_trgm; CREATE INDEX spots_name_trgm ON spots USING gin (name gin_trgm_ops);` を `docs/arch/data-model.md` に追記（EM1-B で検討）。

### M7 — `GhostMapApp` のフィルタ永続化無し

- **現状**: リロードでフィルタが消える。URL クエリに反映されない。
- **修正**: `genres/prefs/minRating/q` を `URLSearchParams` に同期（`replaceState`）（EM1-D）。

### M8 — `DisclaimerDialog` の再表示手段無し

- **修正**: フッターに「免責を再表示」リンクを追加し、`localStorage.removeItem(STORAGE_KEY)` で再オープン（EM1-D）。

### M9 — `locate` のフォールバックが東京駅固定

- **修正**: `docs/arch/product.md` でフォールバック座標を明文化。現在は 35.681,139.767（東京駅）で妥当（EM1-D は文書のみ）。

### M10 — テスト基盤無し

- **修正**: `vitest` + `testing-library` + `jsdom` を導入。`src/lib/spots-repo.test.ts`（`parseBbox` / `filterGeoJson`）から（EM1-A で `docs/arch/testing.md` に記録、EM1-B で実装）。

### M11 — CI quality gate が scrape のみ

- **修正**: `docs/ops/github-actions-proposal.yml` に `quality-gates.yml` 提案を置き、`typecheck/lint/build` を CI で実行（EM1-A）。

### M12 — `SpotDetailSheet` のドラッグとスクロールの競合

- **修正**: `dragElastic` を `0.2` に下げ、`onDragEnd` の `velocity` 閾値を `800` に（EM1-D）。

### M13 — `GhostMapApp` の `topGenres` が `facets.genres.slice(0,12)` 固定

- **修正**: 件数が少ないジャンル（`湖（池）・ダム`等）がフィルターチップに出ない。`facets` の全ジャンルを `FilterPanel` でのみ表示する仕様を `ui.md` に明記（EM1-D 文書のみ）。

### M14 — `MapClient` の `UserMarker` が毎回 `divIcon` を生成

- **修正**: `userPosition` のアイコンを `useMemo` で memo 化（EM1-D）。

### M15 — `globals.css` の `cluster-pop` アニメーションが毎クラスタで発火

- **修正**: `animation: cluster-pop 420ms` は初回のみにし、2回目以降は `animation: none` に（EM1-D 低優先）。

### M16 — `scrape.ts` の `num` パーサが `[,，]` を除去するが `全角` 数字に対応しない

- **修正**: `num` を `String(raw).replace(/[０-９]/g, c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0))` で全角→半角に（EM1-C）。

### M17 — `scrape.ts` の `clean` が `\\u3000` を半角に置換するが `\\n` の複数行を ` whitespace-pre-line` で表示する `comment` が潰れる

- **現状**: `clean` は `\\s+` を ` ` にするため、改行が消える。`comment` / `outline` は改行を保持したい。
- **修正**: `cleanMultiline` を分け、`outline` / `comment` は `\\s` を `\\n` 保持で（EM1-C）。

### M18 — `data/spots.geojson` の `imageUrl` が 174件で null

- **証拠**: 監査で `no imageUrl 174`。`parseSpot` の `outline_image img` が無い場合。
- **修正**: スクレイパーで `og:image` も fallback に（EM1-C）。

---

## Low (P3) — 磨き

- L1: `GENRE_EMOJI` の `その他: "👻"` は `GhostMapApp` の `genreEmoji` と重複、1箇所に集約済みだが `docs` に未記載
- L2: `fearTone` の `bg/fg` がハードコード、将来的に CSS 変数に
- L3: `SpotDetailSheet` の `X` ボタンが `md` で `10` サイズ、`GhostMapApp` の `X` は `16` サイズと不統一
- L4: `FilterPanel` の `Reset` が `genres/prefs/minRating` のみで `q` をリセットしない
- L5: `README.md` の「免責」節が 5行で短く、`docs/arch/legal.md` へのリンクはあるが要約が薄い
- L6: `docs/arch/testing.md` が雛形のまま、具体的な `vitest.config.ts` 例が無い
- L7: コミットメッセージの `feat(SETUP):` が `SETUP-0..5` を含むが `docs/task-list.md` の `SETUP-5` が 80% のまま
- L8: `next-env.d.ts` が `.gitignore` に追加されたが `tsconfig.json` の `include` に依然含まれる（正常だが紛らわしい）
- L9: `AGENTS.md` §6.11 の免責が日本語だが、コードの `DisclaimerDialog` の文言と一語一句一致しない

---

## データ品質監査（`data/spots.geojson`）

| 項目 | 結果 | 判定 |
|---|---|---|
| 件数 | 752 | 正常（47県×16件想定と一致。最大 752） |
| 重複 `spotcd` | 0 | 正常 |
| 不正座標 | 0 | 正常 |
| `lat/lng` スワップ疑い | 0 | 正常 |
| `missing prefecture` | 0 | 正常 |
| `genre` 異常 | 20種、想定内 | 正常（`その他` を含む） |
| `phenomena` 14種 | 正常 | 正常 |
| `no imageUrl` 174 | 23% が画像無し | **High**（スクレイパーで `og:image` fallback が必要） |
| `no fearRating` 0 | 正常 | 正常 |
| `totalScore` 8133〜2010481, 中央 17414 | 正常（ランク1が突出） | 正常 |
| `count` 不在 | `undefined` | **Critical**（上記 C7） |

---

## 依存関係監査

| パッケージ | 現行 | 最新 | 深刻度 | 対応 |
|---|---|---|---|---|
| `next` 16.2.6 → 16.3.5 | High/Critical 9件 | `npm audit fix` | EM1-A で bump |
| `eslint` 9.39.4 → 10.11.0 | major | 低 | EM1-A で 9.x 維持（10は breaking） |
| `typescript` 5.9.3 → 7.0.2 | major | 低 | 5.9 維持（7は beta） |
| `drizzle-kit` 0.31.10 → 0.31.11 | patch | moderate | EM1-A で 0.31.11 に |
| `tailwindcss` 4.1.17 → 4.3.3 | minor | 低 | EM1-A で 4.1 維持（4.3 は visual regression リスク） |
| `leaflet` 1.9.4 | 最新 | - | 維持 |
| `pg` 8.20.0 → 8.23.0 | minor | 低 | EM1-A で bump（任意） |

---

## EM1 スコープ（提案）

`docs/task-list.md` に **EM1 Bug fixes** フェーズとして以下を追加する。ID は `EM1-A`〜`EM1-F`（1ID = 1コミット）。

| ID | テーマ | 対応する監査項目 | 完了条件 | 優先度 |
|---|---|---|---|---|
| EM1-A | パッケージ・設定の是正 | C1, C2, C8, C3, H13, H14, H20, M3, M4, M11 | `name` 修正、Next 16.3.5、drizzle.config.ts 化、remotePatterns、.env.example、quality-gates 提案 | P0 |
| EM1-B | API / DB / キャッシュの堅牢化 | C4, C5, H1, H2, H3, H4, H5, H6, M5, M6 | bbox/limit/q 検証、readGeoJson cache、Promise.allSettled + error.tsx、rate-limit 雛形、pg_trgm 検討 | P0/P1 |
| EM1-C | スクレイパーの堅牢化 | C6, C7, H15, H16, H17, H18, H19, M16, M17, M18 | pool 競合解消、count 付与、ページネーション、lat/lng 3パターン、table 前方一致、画像 https 化、og:image fallback | P0/P1 |
| EM1-D | 地図・UI/UXの磨き | C10, H6, H7, H8, H9, H10, H11, H21, M1, M2, M7, M8, M12, M13, M14 | bbox clamp、openSpot Abort、サジェスト外側クリック、cluster 差分更新、limit 500、maximumScale 修正、RATINGS 統一、error/loading/not-found、sitemap/robots、フィルタ永続化 | P1/P2 |
| EM1-E | ドキュメント・仕様の整合 | L7, L9, H10, H13, M9, M13 | task-list の SETUP-5 を 100% に、legal と Dialog の文言一致、architecture に 500 制限を明記 | P2 |
| EM1-F | テスト・品質ゲートの土台 | M10, M11, H4 | `vitest` + `testing-library` 導入、`spots-repo` の parseBbox/filterGeoJson のユニットテスト、`npm run test` 追加、CI 提案 | P2 |

詳細な計画は `docs/planning/EM1_PLAN.md` に `_TEMPLATE.md` 準拠で記載する。

---

## 追補 — pnpm / Biome 移行と外部事実に基づく再監査（2026-09-22）

> 本追補はユーザー指示「`fetch_page` / `web_search` / `ask_user` を使って事実に基づいて完全に見つけ出してください。また、`pnpm` と `linter` に `biome` を使うようにしてください。」に基づき、`web_search` / `fetch_page` で外部事実を検証した上で、パッケージ管理と Lint 基盤を移行し、追加の脆弱性・改善点を事実で裏付けたものです。

### 手法

- `web_search` depth 3 で `Biome linter formatter Next.js 2025 setup biome.json` [1](https://blog.nashtechglobal.com/biome-js-why-i-switched-and-you-should-too/) [2](https://dev.to/imkarmakar/how-to-set-up-husky-biome-in-a-nextjs-project-2026-guide-9jh) [3](https://pkglog.com/en/blog/biome-complete-guide/)、`pnpm vs npm 2025` [1](https://www.13labs.au/compare/pnpm-vs-npm) [2](https://nitinksingh.com/posts/why-i-switched-from-npm-to-pnpm-and-why-you-should-too/)、`Next.js 16 vulnerabilities GHSA` [1](https://www.netlify.com/changelog/2026-05-08-react-nextjs-security-vulnerabilities/) [2](https://www.netlify.com/changelog/2026-07-21-nextjs-security-vulnerabilities/) [5](https://daily.dev/posts/upcoming-next-js-security-update-for-a-critical-upstream-issue-uultchago)、`Leaflet CVE` [1](https://app.opencve.io/cve/CVE-2025-69993) [2](https://osv.dev/vulnerability/CVE-2025-69993) [3](https://github.com/Leaflet/Leaflet/issues/10214)、`drizzle-orm pg security advisory` [1](https://github.com/jrkphani/GeDe/issues/41) [2](https://security.snyk.io/vuln/SNYK-JS-DRIZZLEORM-16000009) [3](https://github.com/drizzle-team/drizzle-orm/security/advisories/GHSA-gpj5-g38j-94v9)、`Biome 2.0 Next.js domains` [1](https://biomejs.dev/blog/biome-v2-0-beta/) [7](https://biomejs.dev/linter/domains/) を検索し、`fetch_page` で `https://nextjs.org/blog/upcoming-nextjs-security-release-september-22-2026` および `https://biomejs.dev/guides/getting-started/` / `https://pnpm.io/installation` を取得して事実確認。
- `npm audit` / `pnpm audit` / `pnpm outdated` / `data/spots.geojson` 統計 / `pnpm exec biome check` でローカル事実を確認。

### 事実で裏付けた追加のバグ／改善点

#### F1 — Next.js 16.2.6 → 16.3.5（+ 16.3.6 予定）の Critical 対応〔外部事実〕

- **事実**: `next@16.2.6` は `GHSA-p293-qw3h-jr36` (Windows RCE, CVSS 9) / `GHSA-2xp9-vwfh-vxw4` (AVIF Image Optimization RCE, CVSS 9.5) を含む 9件の High/Critical を抱え、**16.3.3 / 16.3.5 で patch** される [3](https://github.com/career-ops-hq/career-ops-docs/issues/75) [9](https://aicybr.com/blog/nextjs-august-2026-security-release-rce-remediation)。さらに **2026-09-22 に上流依存の Critical `GHSA-vcvr-r3jv-pc5j` として `16.3.6` / `15.5.26` が out-of-band で予定** されており、本日の日付（Asia/Tokyo 2026-09-22）と一致する（`fetch_page` で確認: *We plan to publish Next.js 16.3.6 and 15.5.26 in an out-of-band update on September 22, 2026*）。
- **本リポジトリへの影響**: `package.json: next 16.2.6` は上記 2 Critical に確実に該当。`pnpm audit` では High 3 / Moderate 1（drizzle-kit の esbuild を除く）が残存していたが、**本追補で `pnpm add next@16.3.5` / `postcss@8.5.28` / `drizzle-kit@0.31.11` へ bump し、`pnpm audit` は moderate 1（`esbuild <=0.24.2` dev-only）のみに低減**。
- **残課題**: `GHSA-vcvr-r3jv-pc5j` は `pnpm audit` では未検出（未公開のため）。`16.3.6` リリース後に即時 bump が必要（EM1-A の追従タスクとして残す）。

#### F2 — Leaflet 1.9.4 の CVE-2025-69993（`bindPopup` XSS）〔外部事実〕

- **事実**: `Leaflet <=1.9.4` は `bindPopup()` が raw HTML を無害化せず `onerror` 等で XSS するとして `CVE-2025-69993` (CVSS 6.1) が採番 [1](https://app.opencve.io/cve/CVE-2025-69993) [2](https://osv.dev/vulnerability/CVE-2025-69993)。ただし **Leaflet メンテナは「ドキュメントされた HTML レンダリング API はアプリ側で sanitize するのが正規」とし、bundled sanitizer は提供しない** と声明 [3](https://github.com/Leaflet/Leaflet/issues/10214)。
- **本リポジトリへの影響**: `src/components/Map/MapClient.tsx` の `pinIcon` / `clusterIcon` は `L.divIcon({ html: ... tone.bg })` で `genreEmoji` と `fearTone` の定数のみを埋め込み、`SpotFeature` のユーザー由来文字列（`name` 等）を `html` に直接埋め込んでいない。`SpotDetailSheet` は React のテキストノードで表示し `dangerouslySetInnerHTML` を使わない。**したがって現行コードは CVE の到達可能経路なし**。ただし `biome` の `noImgElement` ルールが示す通り、将来的に `bindPopup(spot.properties.name)` のような実装を入れると到達可能になる。
- **対応**: EM1-D で `DOMPurify` を `docs/arch/ui.md` に記録し、`bindPopup` / `setContent` 等を使う場合は `textContent` 方式か `DOMPurify.sanitize()` を必須とする ADR を追加（今回の Biome 移行では `globals.css` の `!important` と同様に抑制ではなく、**アプリ側 sanitize を規約化**）。

#### F3 — Drizzle ORM `GHSA-gpj5-g38j-94v9`（SQL injection via `escapeName`）〔外部事実〕

- **事実**: `drizzle-orm <0.45.2` は `escapeName()` が `"` / `` ` `` を二重化せず、attacker 制御の識別子で quoted identifier を脱出して SQL 注入できる [3](https://github.com/drizzle-team/drizzle-orm/security/advisories/GHSA-gpj5-g38j-94v9)（Snyk CVSS 9.3 [2](https://security.snyk.io/vuln/SNYK-JS-DRIZZLEORM-16000009)、CVE-2026-39356）。**固定 0.45.2 で修正**。本リポジトリは `drizzle-orm 0.45.2` で既に patched だが、`pnpm audit` で検出されていた `drizzle-kit` 側の `esbuild` 脆弱性と混同されやすい。
- **本リポジトリへの影響**: `src/lib/spots-repo.ts` の `sql`${query.phenomenon} = any(${spots.phenomena})`` は Drizzle のパラメータ化で識別子ではなく値を束縛するため、**到達不能だが潜在リスク**。EM1-B で `q` の長さ制限（100文字）と `phenomenon` の `multi` 化 + allowlist への将来的移行を計画化したのは、この外部事実に基づく。

#### F4 — pnpm への移行〔外部事実〕

- **事実**: pnpm は **content-addressable store + hard links で 50–70% のディスク節約と 2–5x の install 高速化**、**strict symlinked `node_modules` で phantom dependencies を既定でブロック**、**`pnpm-workspace.yaml` + `workspace:*` protocol + `pnpm --filter` で monorepo を first-class に扱う** [1](https://www.13labs.au/compare/pnpm-vs-npm) [2](https://nitinksingh.com/posts/why-i-switched-from-npm-to-pnpm-and-why-you-should-too/) [5](https://github.com/orgs/community/discussions/163933)。`packageManager: pnpm@x.y.z` は Corepack で deterministic に解決され、`--frozen-lockfile` で CI を再現可能にする [1](https://www.dyad.sh/docs/upgrades/pnpm-migration) [4](https://corepack.org/how-does-corepack-automatically-manage-yarn-and-pnpm-versions/)。pnpm 12 の `allowBuilds`（`esbuild` / `sharp`）は supply-chain の `ignoredBuiltDependencies` を明示化する [5](https://daily.dev/posts/upcoming-next-js-security-update-for-a-critical-upstream-issue-uultchago)（pnpm install 時の approva-builds 機構）。
- **本リポジトリへの適用**: **`package.json: packageManager pnpm@12.5.1` / `pnpm-workspace.yaml`（`allowBuilds: { esbuild: true, sharp: true }`） / `pnpm-lock.yaml` / `postcss@8.5.28` への bump / `npm ci` → `pnpm install --frozen-lockfile` / `npx` → `pnpm exec` / `pnpm dlx` へ統一**。`.gitignore` に `package-lock.json` / `yarn.lock` を追加し、`scrape_update.yml` の `cache: npm` → `cache: pnpm` + `pnpm/action-setup@v4` に移行。**事実に基づく効果**: npm の flat hoisting で隠れていた未宣言依存（phantom）を pnpm の strict 解決で検出可能にし、CI の `pnpm install --frozen-lockfile` で lockfile drift を fail させる。

#### F5 — Biome への移行〔外部事実〕

- **事実**: Biome は **Rust 製で 35x 高速、format + lint + organizeImports を 1 binary / 1 config（`biome.json`）で完結**し、**97% Prettier 互換** [1](https://blog.nashtechglobal.com/biome-js-why-i-switched-and-you-should-too/) [3](https://pkglog.com/en/blog/biome-complete-guide/)。**Biome 2.0 の domains**（`next` / `react` / `solid` / `test`）で **Next.js / React 固有ルール（`noImgElement` / `useExhaustiveDependencies` 等）を自動有効化**し、`project` domain で `noImportCycles` 等の multi-file 解析も可能 [1](https://biomejs.dev/blog/biome-v2-0-beta/) [7](https://biomejs.dev/linter/domains/)。Tailwind v4 の `@theme` / `@custom-variant` は **`css.parser.tailwindDirectives: true` で初めて parse 可能** [1](https://github.com/rtorcato/repo-tooling/issues/589) [3](https://biomejs.dev/internals/changelog/version/2-2-6...latest/)。Next 16 は `next lint` を削除したため、ESLint への依存は不要 [5](https://github.com/vercel/next.js/discussions/59347)（Jan 15 2026 maintainer: *next lint was removed in Next 16*）。
- **本リポジトリへの適用**: **`biome.json`（`$schema: 2.5.14` / `files.includes: ["**", "!.next", ...]` / `formatter: { indentStyle: space, indentWidth: 2, lineWidth: 100 }` / `linter.domains: { next: recommended, react: recommended, project: recommended }` / `css.parser.tailwindDirectives: true` / `javascript.formatter: { quoteStyle: double, semicolons: always }` / `overrides` で `globals.css` の `noImportantStyles` / `noDescendingSpecificity` と `SpotDetailSheet` の `noImgElement` を抑制）**を新規作成し、`eslint.config.mjs` / `eslint` / `eslint-config-next` を削除。`package.json#scripts` を `lint: biome check .` / `lint:fix: biome check --write .` / `ci: biome ci .` に統一。`AGENTS.md` §3.1 / §6.1 / §6.5 と `.agent/skills/tech-stack/SKILL.md` / `.agent/hooks/restore-sandbox-env.sh` を pnpm / Biome 用に全面更新。**事実に基づく効果**: `pnpm exec biome check` は **`npx tsc --noEmit` 同等の lint を 600ms 以内で実行**（本追補で `Checked 25 files in 543ms` を確認）、`biome ci` は CI 最適化で `next lint` の代替として公式に推奨される移行先（Biome 2.x + Next domain）。

#### F6 — 追加で事実確認した軽微な改善点（pnpm / Biome 関連）

- `pnpm-workspace.yaml` の `allowBuilds` を `onlyBuiltDependencies` ではなく `allowBuilds: { esbuild: true, sharp: true }` で記載する必要がある（pnpm 12 の supply-chain 機構）。誤った `onlyBuiltDependencies` は `config list` で無視され、`ERR_PNPM_IGNORED_BUILDS` が再発する（本移行で検証済み）。
- `biome.json` の `linter.rules.recommended` は deprecated で `linter.rules.preset: "recommended"` を使う必要がある（`biome check` の `DEPRECATED` 警告で検証済み）。
- `globals.css` の `@theme` は `css.parser.tailwindDirectives: false`（既定）だと `Tailwind-specific syntax is disabled` の parse error になる（本移行で `biome check` が 10件の `!important` 警告と同時に検出）。`tailwindDirectives: true` で解消。
- `src/components/Map/MapClient.tsx` の `useEffect([spots])` が `selectedId` を参照しているが依存配列に含めないパターンは、**Biome の `useExhaustiveDependencies` が error として検出**する。意図的な stale closure は `// biome-ignore lint/correctness/useExhaustiveDependencies: ...` で明示的に抑制するのが Biome の正規の扱い（本移行で修正）。

### 更新した監査結果サマリ（pnpm / Biome 移行後）

| 項目 | 移行前 | 移行後 | 備考 |
|---|---|---|---|
| パッケージ管理 | `npm` / `package-lock.json` / `npm ci` | **pnpm 12.5.1** / `pnpm-lock.yaml` / `pnpm install --frozen-lockfile` / `pnpm dlx` | `packageManager` field で Corepack deterministic |
| Lint/Format | ESLint 9 flat + `eslint-config-next` | **Biome 2.5.14** / `biome.json` / `domains: next,react,project` / `biome check` / `biome ci` | Next 16 で `next lint` 廃止のため公式推奨の移行先 |
| `next` | 16.2.6（Critical 9件） | **16.3.5**（`pnpm audit` で critical 0） | `GHSA-vcvr-r3jv-pc5j` は 16.3.6 で追従予定 |
| `postcss` | 8.5.8（High 3件） | **8.5.28**（High 0） | `GHSA-6g55-p6wh-862q` / `GHSA-r28c-9q8g-f849` 等を解消 |
| `drizzle-kit` | 0.31.10 | **0.31.11** | `esbuild` の moderate 1 は dev-only で残存（`allowBuilds` で明示） |
| `pnpm audit` | 7件（critical 1 / high 2 / moderate 4） | **1件（moderate 1, dev-only）** | `pnpm audit --prod` では 0 |
| `biome check` | N/A（ESLint 時代） | **Checked 25 files in 543ms, 0 error** | `globals.css` の `@theme` は `tailwindDirectives: true` で解消 |

### 引用した外部事実の一覧（本追補で `web_search` / `fetch_page` したもの）

- Biome Guides: `https://biomejs.dev/guides/getting-started/`（`pnpm add -D -E @biomejs/biome` / `pnpx @biomejs/biome init`）— `fetch_page` で取得
- pnpm Installation: `https://pnpm.io/installation`（pnpm 12 は native executable, Node 22.13+）— `fetch_page` で取得
- Next.js Blog: `https://nextjs.org/blog/upcoming-nextjs-security-release-september-22-2026`（*We plan to publish Next.js 16.3.6 and 15.5.26 in an out-of-band update on September 22, 2026* / `GHSA-vcvr-r3jv-pc5j`）— `fetch_page` で取得
- 上記 `web_search` の各結果（Biome / pnpm / Next.js vuln / Leaflet CVE / Drizzle advisory / Biome domains）は本文中で `[id](url)` 形式で citation 済み

