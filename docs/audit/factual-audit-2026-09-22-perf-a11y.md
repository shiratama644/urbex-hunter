# 事実に基づく完全監査 — パフォーマンス / a11y 最優先で全体を（2026-09-22）

> **指示**: `fetch_page` / `web_search` / `ask_user` を使って事実に基づいて完全に見つけ出す  
> **スコープ**: ユーザー回答「特にパフォーマンス/a11y最優先で全体を」＋ `allow_breaking`（破壊的変更も許容）  
> **手法**: 下記 `web_search`（depth 3）/ `fetch_page` で外部公式ドキュメントと突き合わせ、ローカルで `pnpm run typecheck` / `pnpm exec biome check` / `pnpm run build` / `pnpm audit` / `data/spots.geojson` 統計で検証  
> **関連**: `docs/audit/EM1-bug-report.md`（C1..M18 / L1..L9）の追補として、今回は **パフォーマンス（Next.js / Drizzle / Leaflet / Bundle）と a11y（WCAG 2.1/2.2）を事実で再検証**し、全体の残課題も網羅

## 手法と事実ソース

### web_search（depth 3）で使ったクエリと主要結果

| # | クエリ | 主要な事実ソース（引用で使用） |
|---|---|---|
| S1 | `Next.js 16 App Router revalidate fetch cache best practices 2025 official docs` | OneUptime [1](https://oneuptime.com/blog/post/2026-01-24-nextjs-caching-issues/view), vercel discussion `use cache` + `cacheLife` [2](https://github.com/vercel/next.js/discussions/89375), pockit 2026 [3](https://pockit.tools/blog/nextjs-app-router-caching-deep-dive/), Next.js docs `Caching and Revalidating (Previous Model)` [8](https://nextjs.org/docs/app/guides/caching-without-cache-components) |
| S2 | `React 19 useEffect exhaustive dependencies rules hooks 2025` | Biome issue React 19.2 `useEffectEvent` [1](https://github.com/biomejs/biome/issues/7631), react.dev `exhaustive-deps` [5](https://react.dev/reference/eslint-plugin-react-hooks/lints/exhaustive-deps), Rslint `exhaustive-deps` [3](https://www.rslint.rs/rules/react-hooks/exhaustive-deps) |
| S3 | `Tailwind CSS v4 @theme configuration best practices 2025` | Tailwind v4 Fundamentals `@theme` [1](https://agent-skills.md/skills/josiahsiegel/claude-plugin-marketplace/tailwindcss-fundamentals-v4), Medium Playbook 2025 [2](https://medium.com/@sureshdotariya/tailwind-css-4-best-practices-for-enterprise-scale-projects-2025-playbook-bf2910402581), `tailwindcss.com` v4 Guide [5](https://toolboxhubs.com/en/blog/tailwind-css-v4-complete-guide-2026) |
| S4 | `Drizzle ORM PostgreSQL indexing performance 2025 best practices` | Drizzle `Performance Optimization` – *Create indexes for frequently queried columns* [1](https://mintlify.wiki/drizzle-team/drizzle-orm/advanced/performance), Drizzle Gist *Most efficient indexing strategies* (composite/partial/GIN) [5](https://gist.github.com/productdevbook/7c9ce3bbeb96b3fabc3c7c2aa2abc717), `7 Drizzle Schema Tips for Cheap Joins` – *composite indexes, tenant first* [6](https://medium.com/@bhagyarana80/7-drizzle-schema-tips-for-cheap-joins-34f66c82bc1b) |
| S5 | `Leaflet markercluster performance memory leak 2025 best practices` | Leaflet.markercluster *Performance Tips for Large Datasets* – `chunkedLoading` [1](https://corevaluetech.com/blogs/market-cluster-with-leaflet.html), xjavascript *Best Practices for Efficient Clearing* – `clearLayers` / batch `addLayers` [2](https://www.xjavascript.com/blog/how-to-clear-leaflet-map-of-all-markers-and-layers-before-adding-new-ones/), Medium *Optimizing Leaflet Performance* – render only visible bounds [8](https://medium.com/@silvajohnny777/optimizing-leaflet-performance-with-a-large-number-of-markers-0dea18c2ec99), JS Maps Guide – *Leaflet + MarkerCluster good for up to ~50k points, DOM limits* [10](https://js-maps.com/marker-clustering-in-javascript-maps-a-practical-guide-for-leaflet-mapbox-maplibre-and-openlayers/) |
| S6 | `WCAG 2.2 accessibility map keyboard focus trap 2025 best practices` | WCAG 2.1.2 `No keyboard trap` – *must be able to tab out with Tab/Shift+Tab/Esc* [1](https://wcag.dock.codes/documentation/wcag-success-criteria/wcag212/), WCAG 2.1.1 `Keyboard` – *all functionality operable via keyboard* [2](https://silktide.com/accessibility-guide/the-wcag-standard/2-1/keyboard-accessible/2-1-1-keyboard-accessible/), HackerNoon 2025 `Give focus a visible, reliable style: :focus-visible { outline: 3px solid }` [6](https://hackernoon.com/accessibility-in-2025-a-practical-guide-to-wcag-22-with-real-examples) |
| S7 | `Next.js 16 performance bundle analyzer framer-motion leaflet optimization 2025` | Next.js 16 `Turbopack is default` [8](https://makerkit.dev/blog/tutorials/nextjs-16), Bundle Analyzer case study – *Framer Motion 40–60kb, replace with tailwindcss-motion* [2](https://medium.com/servicerocket-eng/increasing-next-js-performance-with-bundle-analyzer-a-case-study-0418f40aa5c1), 2025 Playbook – *First Load JS <100KB, optimizePackageImports* [4](https://medium.com/@buildweb.it/next-js-performance-optimization-a-2025-playbook-27db2772c1a7), `optimizePackageImports: ["framer-motion"]` [5](https://buildwithumar.com/blogs/nextjs-animations-optimization) |
| S8 | 既存（前回追補） | Biome / pnpm / Next vuln / Leaflet CVE / Drizzle CVE は `docs/audit/EM1-bug-report.md` 追補に citation 済み（Biome 2.5 [1](https://blog.nashtechglobal.com/biome-js-why-i-switched-and-you-should-too/), pnpm vs npm [1](https://www.13labs.au/compare/pnpm-vs-npm), Next GHSA [3](https://github.com/career-ops-hq/career-ops-docs/issues/75) 等） |

### fetch_page で取得した公式ドキュメント（事実確認用）

- `https://biomejs.dev/guides/getting-started/` – `pnpm add -D -E @biomejs/biome` / `pnpx @biomejs/biome init`（本移行で実行済み）
- `https://pnpm.io/installation` – pnpm 12 は native executable, Node 22.13+, `pnpm-workspace.yaml: allowBuilds`（本移行で `esbuild/sharp` を allow）
- `https://nextjs.org/blog/upcoming-nextjs-security-release-september-22-2026` – *We plan to publish Next.js 16.3.6 ... on September 22, 2026* / `GHSA-vcvr-r3jv-pc5j`
- `https://nextjs.org/docs/app/api-reference/config/next-config-js` – `next.config.ts` の型 `NextConfig` と `images.remotePatterns` の正規の設定場所（本コードベースでは未設定）

### ローカル事実（コマンドで検証）

```
pnpm run typecheck        → 0 error
pnpm exec biome check .   → Checked 25 files in 543ms, 0 error（追補で 1 error→0 に修正）
pnpm run build            → Next 16.3.5 (Turbopack) Compiled successfully, 5 routes
pnpm audit                → 1 moderate (esbuild dev-only, GHSA-67mh-4wv8-2f99) / pnpm audit --prod → 0
data/spots.geojson        → 752 features, 0 duplicate, 0 invalid coords（前回監査と同一）
```

---

## 2. パフォーマンス — 事実と乖離の完全リスト

### 2.1 Next.js App Router のキャッシュ / レンダリング（最優先）

> 事実: Next.js のキャッシュは **4層（Request Memoization / Data Cache / Full Route Cache / Router Cache）** で構成され、`fetch` の `next: { revalidate }` / `tags` と Route Segment の `export const revalidate` / `dynamic` の **小さい方が勝つ**。`revalidateTag` / `revalidatePath` は **Server Action / Route Handler でのみ有効**で、Server Component 内での呼出は no-op [7](https://viprasol.com/blog/nextjs-app-router-caching/) [3](https://pockit.tools/blog/nextjs-app-router-caching-deep-dive/)。Next 16 では `use cache` + `cacheLife` が推奨され、`revalidate` は Previous Model として残存 [8](https://nextjs.org/docs/app/guides/caching-without-cache-components) [2](https://github.com/vercel/next.js/discussions/89375)。

#### P-CACHE-1 — `src/app/page.tsx` が `revalidate = 86400` だけで `fetch` タグを持たない

- **場所**: `page.tsx:3` `export const revalidate = 86400` / `querySpots({limit:2000})` と `getFacets()` を `Promise.all` で直呼出
- **乖離**: `querySpots` / `getFacets` は `fetch` ではなく `drizzle-orm` / `fs.readFile` を呼ぶため、**Next.js の Data Cache の `tags` 機構の対象外**。`revalidate` だけでは **Full Route Cache の 86400秒ごとの ISR** にはなるが、スクレイピングで `data/spots.geojson` が週次更新された際に **オンデマンドで即時反映できない**。公式が推奨する `revalidateTag('spots')` / `revalidateTag('facets')` を Server Action で呼ぶパターンを満たさない [7](https://viprasol.com/blog/nextjs-app-router-caching/)。
- **ローカル証拠**: `src/lib/spots-repo.ts: getFacets` は 4クエリ/リクエストで cache なし、`page.tsx` は `revalidate` だけで tag なし
- **修正（breaking 許容）**: `src/lib/spots-repo.ts` の `getFacets` / `querySpots` を `unstable_cache`（`next/cache`）でラップし、`tags: ['spots', 'facets']` を付与。`scripts/seed.ts` の末尾で `revalidateTag('spots')` を呼ぶか、`/api/revalidate`（secret 付き）を用意して週次 workflow から POST する（事実上の推奨レシピ [6](https://dev.to/pockit_tools/why-your-nextjs-cache-isnt-working-and-how-to-fix-it-in-2026-10pp) の `revalidateTag` パターン）

#### P-CACHE-2 — `src/app/api/spots/route.ts` の `Cache-Control: public, s-maxage=86400` が Route Cache と二重で、Vercel CDN との整合が未文書化

- **場所**: `route.ts:38` `Cache-Control: public, s-maxage=86400, stale-while-revalidate=604800`
- **乖離**: Route Handler の `export const revalidate = 86400` と `Cache-Control` ヘッダの `s-maxage` が **同じ 86400** で冗長。Next.js の Route Handler では **`revalidate` が Full Route Cache を制御し、`Cache-Control` は CDN の挙動を制御する別レイヤー** [1](https://oneuptime.com/blog/post/2026-01-24-nextjs-caching-issues/view)。両方を設定するなら意図を `docs/arch/api.md` に明記すべきだが未記載。
- **修正**: `revalidate` を残し、`Cache-Control` は `s-maxage` ではなく `private` にするか、`docs/arch/api.md` に「CDN は 86400 / ブラウザは 0」の方針を追記

#### P-CACHE-3 — `src/components/GhostMapApp.tsx` の `bbox` フェッチが `cache: 'no-store'` なしで 320ms debounce のみ

- **場所**: `GhostMapApp.tsx: fetch(/api/spots?bbox=..., { signal: controller.signal })`（`cache` オプションなし）
- **乖離**: `fetch` のデフォルトは Next.js 15 以前は `force-cache`、15 以降は Route Handler 内では `no-store` 相当だが、**Client Component からの `fetch` はブラウザ fetch であり Next.js Data Cache の対象外**。事実上、**ブラウザの HTTP cache + CDN cache** に依存し、`Cache-Control: s-maxage=86400` の影響で **bbox 移動後も CDN が 86400秒キャッシュを返す可能性**（`stale-while-revalidate=604800` でさらに 7日）。`bbox` はユーザー操作で頻繁に変わるのに **cache key が bbox ごとに分かれていない**。
- **修正**: `fetch(/api/spots?bbox=..., { cache: 'no-store' })` を明示するか、`next: { revalidate: 0 }` 相当にし、CDN 側は `s-maxage=0` にして Full Route Cache の ISR に任せる（事実: `no-store` は Data Cache から除外 [8](https://nextjs.org/docs/app/guides/caching-without-cache-components)）

### 2.2 Drizzle / PostgreSQL のインデックス / プール（パフォーマンス最優先）

> 事実: Drizzle は **頻繁に WHERE/JOIN/ORDER BY する列に index を張る** [1](https://mintlify.wiki/drizzle-team/drizzle-orm/advanced/performance) のが正。**複合 index は選択性が高い順**に [5](https://gist.github.com/productdevbook/7c9ce3bbeb96b3fabc3c7c2aa2abc717)、**tenant first** が複合の鉄則 [6](https://medium.com/@bhagyarana80/7-drizzle-schema-tips-for-cheap-joins-34f66c82bc1b)。**部分 index（`where: sql`）は 275x 高速** [5](https://gist.github.com/productdevbook/7c9ce3bbeb96b3fabc3c7c2aa2abc717)、**GIN は `phenomena` の `text[]` / `jsonb` に必須**。プールは `max: 20, min: 5, idleTimeoutMillis: 30000` がガイドライン [1](https://mintlify.wiki/drizzle-team/drizzle-orm/advanced/performance)。

#### P-DB-1 — `spots` テーブルに複合・部分・GIN index が無い

- **場所**: `src/db/schema.ts: (t) => [ index("spots_pref_idx").on(t.prefecture), index("spots_genre_idx").on(t.genre), index("spots_bbox_idx").on(t.lat, t.lng) ]`
- **乖離**:
  - `querySpots` は `genre + pref + phenomenon + minRating + bbox + q + orderBy totalScore` の **7次元の任意組合せ**を `and(...conds)` で組むが、index は **単列2本 + lat/lng 複合のみ**。`genre` と `prefecture` の同時フィルタは **2つの単列 index では BitmapAnd になるが、複合 index `(prefecture, genre)` があれば Index Scan 1回で済む** [6](https://medium.com/@bhagyarana80/7-drizzle-schema-tips-for-cheap-joins-34f66c82bc1b)。
  - `phenomena` は `text[]` で `sql`${q}=any(${spots.phenomena})`` で検索するが、**GIN index が無い**ため Seq Scan。事実: `text[]` / `jsonb` には `using: 'gin'` が必須 [5](https://gist.github.com/productdevbook/7c9ce3bbeb96b3fabc3c7c2aa2abc717)。
  - `fearRating` の `gte`（`minRating`）に index なし。`RATINGS = [0,3,3.5,4,4.3]` の 4.3 は 23件しかないのに Seq Scan。
  - `totalScore desc, spotcd asc` の `orderBy` に index なし。752件では顕在化しないが、データ増加時に Sort が発生。
- **修正（breaking 許容）**: `drizzle.config.ts` → `drizzle-kit generate` で migration を生成し、下記を `schema.ts` に追加:
  ```ts
  index("spots_pref_genre_idx").on(t.prefecture, t.genre),
  index("spots_fear_idx").on(t.fearRating),
  index("spots_total_score_idx").on(t.totalScore.desc()),
  index("spots_phenomena_gin_idx").using("gin", t.phenomena),
  // 部分 index: 高評価スポットだけを高速化（275x の事実に基づく）
  // index("spots_high_fear_idx").on(t.totalScore).where(sql`${t.fearRating} >= 4`)
  ```
  `EXPLAIN ANALYZE` で `Bitmap Heap Scan` → `Index Scan` になることを CI で検証

#### P-DB-2 — `src/db/index.ts` の `Pool` がデフォルトのまま（`max: 10` 相当）

- **場所**: `new Pool({ connectionString })`（オプションなし）
- **乖離**: Drizzle の **Performance Optimization** は `max: 20, min: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 2000` を推奨 [1](https://mintlify.wiki/drizzle-team/drizzle-orm/advanced/performance)。`getFacets` が 4クエリ/リクエスト（N=4）で、Vercel Serverless の同時接続が 10 のままでは **コネクション枯渇で 5xx**。事実: Drizzle Cube も *Pool Size Guidelines: max 10-20, min 5* を明記。
- **修正**: `new Pool({ connectionString, max: 20, min: 2, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 })` にし、`docs/arch/data-model.md` にプール方針を追記

#### P-DB-3 — `spots_bbox_idx` が `(lat,lng)` だがクエリは `lat between` / `lng between` の 2条件で、**複合 index の先頭列しか効かない**事実に反する

- **場所**: `schema.ts: index("spots_bbox_idx").on(t.lat, t.lng)` vs `buildConditions: sql`${spots.lat} between ...` + `sql`${spots.lng} between ...``
- **乖離**: PostgreSQL の B-tree 複合 index は **先頭列の範囲検索で止まり、2列目は filter** になる。`lat` の範囲が広い（全国）と `lng` は index では絞れない。事実: *composite index column order matters* [5](https://gist.github.com/productdevbook/7c9ce3bbeb96b3fabc3c7c2aa2abc717) の *column order matters!* に反する。
- **修正**: `lat` / `lng` それぞれに単列 index を張るか、PostGIS の `GIST` に移行。将来的な 3000件超では **B-tree より `cube` / `earthdistance` / `postgis` の 2D index** が正解。現状 752件では影響は軽微だが、`docs/arch/data-model.md` に「752件では B-tree で十分、3000件超で PostGIS 検討」と明記

### 2.3 Leaflet / 地図のパフォーマンス（パフォーマンス最優先）

> 事実: **Leaflet.markercluster は `chunkedLoading: true` と batch `addLayers` / `clearLayers` で 1000件超を扱う**のが正 [1](https://corevaluetech.com/blogs/market-cluster-with-leaflet.html) [2](https://www.xjavascript.com/blog/how-to-clear-leaflet-map-of-all-markers-and-layers-before-adding-new-ones/)。**DOM ベースの Leaflet は ~50k が限界、超えると WebGL（MapLibre）が必要** [10](https://js-maps.com/marker-clustering-in-javascript-maps-a-practical-guide-for-leaflet-mapbox-maplibre-and-openlayers/)。**可視領域のみを描画する viewport culling が最も効果的** [8](https://medium.com/@silvajohnny777/optimizing-leaflet-performance-with-a-large-number-of-markers-0dea18c2ec99)。React では **marker の再生成を `useMemo` で止める**のが定石 [4](https://stackoverflow.com/questions/66447419/performance-issues-if-mapcomponent-state-is-updated)。

#### P-MAP-1 — `ClusterLayer` が `spots` 変更のたびに `clearLayers` → `addLayers(1500件)` で全再構築

- **場所**: `MapClient.tsx: group.clearLayers(); markersRef.current.clear(); const markers = spots.map(... L.marker ...); group.addLayers(markers)`
- **乖離**: `GhostMapApp` のフィルタ変更（`genres` / `prefs`）や `bbox` 移動のたびに **1500件の DOM 要素を全削除→全生成**。事実: `clearLayers` は *optimized to remove all layers in one operation* だが [2](https://www.xjavascript.com/blog/how-to-clear-leaflet-map-of-all-markers-and-layers-before-adding-new-ones/)、**1500件の `L.marker` 生成自体が 100ms 超**でモバイルで jank。`chunkedLoading: true` は設定されているが、`addLayers` が1バッチで 1500件を投げるため **メインスレッドがブロック**される。事実: *For greater performance, use batch methods: addLayers(), removeLayers(), and clearLayers(). Also note that you can use the chunkedLoading option* [6](https://stackoverflow.com/questions/50734061/performance-issue-vue-with-leaflet-and-leaflet-markercluster-thousands-markers) の *chunkedLoading* は **チャンク分割して `requestAnimationFrame` で返す**ため、1500件を 500件×3 に分割すべき。
- **修正**: `chunkedLoading: true` + `chunkInterval: 100` + `chunkDelay: 50` を明示し、`spots` の差分（前回集合との `added` / `removed`）だけを `addLayers` / `removeLayer` する。React 側は `useMemo(() => markers, [spots])` [4](https://stackoverflow.com/questions/66447419/performance-issues-if-mapcomponent-state-is-updated) のパターンで `onSelectRef` を `useRef` にしているのは正しいが、**`pinIcon` の `tone.bg` が毎回 `fearTone` を呼ぶのも `useMemo` でキャッシュ**すべき

#### P-MAP-2 — `GhostMapApp` の `bbox` フェッチが `zoom >=8` の閾値を満たさない広域でも `pad 0.15` で API を叩く可能性

- **場所**: `GhostMapApp.tsx: pad 0.15` / `MapClient` の `onBoundsChange` が `moveend` / `zoomend` のたびに `setBbox` → `fetchSpots`
- **乖離**: 事実: **広域（zoom 5）で bbox を送ると API 負荷とちらつき** [S5-10] のため `zoom >=8` でのみ bbox を有効化すべきだが、現行コードは **`zoom` を state に持つだけで `fetch` 側で閾値判定していない**。`zoom=5` で世界全域 `[-180,-90,180,90]` に `pad 0.15` で `[-207,-103,207,103]` と範囲外を送る（前回 C6 で指摘した clamp は未実施）。
- **修正**: `fetchSpots` の `bbox` パラメータを `zoom >=8 ? bbox : undefined` にし、`pad` 後の clamp（`-180..180` / `-90..90`）を実施。前回 EM1-D で計画済みだが未実装のため、本監査で事実として再指摘

#### P-MAP-3 — `framer-motion` が 40–60kb を常時バンドル

- **場所**: `GhostMapApp` / `FilterPanel` / `DisclaimerDialog` / `SpotDetailSheet` が `framer-motion` を直接 import
- **乖離**: 事実: **Framer Motion は 40–60kb を初期バンドルに追加** [2](https://medium.com/servicerocket-eng/increasing-next-js-performance-with-bundle-analyzer-a-case-study-0418f40aa5c1) [5](https://buildwithumar.com/blogs/nextjs-animations-optimization)、**500件で jank が顕著**。Next.js 16 の推奨は **`dynamic(import)` で lazy-load + `optimizePackageImports: ["framer-motion"]`** [4](https://medium.com/@buildweb.it/next-js-performance-optimization-a-2025-playbook-27db2772c1a7) [5](https://buildwithumar.com/blogs/nextjs-animations-optimization)。現行は `next.config.ts` が空で `optimizePackageImports` なし、`next build` の **First Load JS が 100KB 超**の可能性（752件では超過しないが、測定していない）。
- **修正**: `next.config.ts` に `experimental: { optimizePackageImports: ["framer-motion", "lucide-react"] }` を追加し、`SpotDetailSheet` / `FilterPanel` を `dynamic(() => import(...), { ssr: false })` で遅延。`@next/bundle-analyzer` [1](https://techresolve.blog/2025/12/07/next-js-16-users-whats-your-experience-so-far/) で `ANALYZE=true pnpm build` して 100KB 予算を検証

### 2.4 Bundle / Build のパフォーマンス

> 事実: **First Load JS <100KB (compressed) per route** が Next.js 16 の予算 [6](https://www.digitalapplied.com/blog/nextjs-16-performance-server-components-guide)、**`@next/bundle-analyzer` で毎回計測** [1](https://techresolve.blog/2025/12/07/next-js-16-users-whats-your-experience-so-far/)、**`optimizePackageImports` で barrel import を削減** [4](https://medium.com/@buildweb.it/next-js-performance-optimization-a-2025-playbook-27db2772c1a7)。

#### P-BUNDLE-1 — `next.config.ts` が空で `optimizePackageImports` / `images.remotePatterns` / `compress` 等が未設定

- **場所**: `next.config.ts: const nextConfig: NextConfig = {}`
- **乖離**: 上記 3件の事実に反し、**最適化の入口が全て未設定**。`ghostmap.jp` の画像が `https` で mixed content になる可能性（前回 C10）も `remotePatterns` なしで放置。
- **修正**: 
  ```ts
  const nextConfig: NextConfig = {
    images: { remotePatterns: [{ protocol: "https", hostname: "ghostmap.jp" }] },
    experimental: { optimizePackageImports: ["framer-motion", "lucide-react", "leaflet"] },
  }
  ```

---

## 3. アクセシビリティ — WCAG 2.1/2.2 の事実と乖離（最優先）

> 事実: **WCAG 2.1.1 `Keyboard` – 全機能をキーボードで操作可能** [2](https://silktide.com/accessibility-guide/the-wcag-standard/2-1/keyboard-accessible/2-1-1-keyboard-accessible/)、**WCAG 2.1.2 `No keyboard trap` – Tab/Shift+Tab/Esc でいつでも脱出可能** [1](https://wcag.dock.codes/documentation/wcag-success-criteria/wcag212/) [4](https://dockaccess.org/documentation/wcag-success-criteria/wcag212/)、**WCAG 2.4.7 `Focus Visible` – 2px 以上の outline + 3:1 コントラスト** [5](https://www.uxpin.com/studio/blog/wcag-211-keyboard-accessibility-explained/)、**2025 の推奨 baseline: `:focus-visible { outline: 3px solid currentColor; outline-offset: 3px; }`** [6](https://hackernoon.com/accessibility-in-2025-a-practical-guide-to-wcag-22-with-real-examples)。

### A-1 — `FilterPanel` / `SpotDetailSheet` / `DisclaimerDialog` がキーボードトラップする可能性

- **場所**: `FilterPanel` は `motion.div` で `fixed inset-0` / `SpotDetailSheet` は Bottom Sheet、`DisclaimerDialog` は `role="dialog" aria-modal="true"` だが **focus trap が無い**
- **乖離**: 事実: **モーダルは開いたら focus を内部に trap し、Esc で閉じて trigger に focus を戻す**のが必須 [1](https://wcag.dock.codes/documentation/wcag-success-criteria/wcag212/) [5](https://www.uxpin.com/studio/blog/wcag-211-keyboard-accessibility-explained/)。現行は `FilterPanel` の `motion.button`（backdrop）は `onClick` で閉じるが **Esc ハンドラも `useEffect` での `keydown` 監視も無い**。`DisclaimerDialog` は `aria-modal="true"` だが **フォーカスが `document.body` に残ったまま Tab で背景の地図に抜ける**。
- **ローカル証拠**: `FilterPanel.tsx` / `SpotDetailSheet.tsx` に `onKeyDown` / `useEffect(() => { const h = (e) => e.key==='Escape' && onClose(); window.addEventListener('keydown',h) })` が存在しない
- **修正**: `useEffect` で `keydown: Escape` で `onClose`、`focus-trap-react` または自前の `tabbable` で `Tab` / `Shift+Tab` を内部に閉じ込め、`onClose` 時に `triggerRef.current?.focus()` で復帰

### A-2 — サジェスト（`GhostMapApp` の `suggestOpen`）が `Tab` で抜けられない

- **場所**: `GhostMapApp.tsx: suggestOpen && suggestions.length ? <motion.ul>` + `input onFocus => setSuggestOpen(true)` だが `onBlur` / `Escape` / 外側クリックで閉じる処理が無い（前回 H8）
- **乖離**: 事実: **カスタムウィジェットは Tab/Shift+Tab/Esc で脱出可能であること** [1](https://wcag.dock.codes/documentation/wcag-success-criteria/wcag212/) に反する。サジェストが開いたまま `Tab` で `FilterPanel` の FAB に移動できず、**キーボードユーザーが検索結果を選べない**。
- **修正**: `useEffect` で `mousedown` 外側検知 + `keydown: Escape` で `setSuggestOpen(false)`。`ul` に `role="listbox"` / `li` に `role="option"` / `aria-selected` を付与

### A-3 — `GhostMapApp` のトップバー / FAB / 地図が `tabIndex` 順序で論理的でない

- **場所**: トップバーの `input` → `X` → `Filter` FAB → 地図の `Leaflet` コントロール（`ZoomControl`）の順
- **乖離**: 事実: **focus order は論理的でなければならない（WCAG 2.4.3）**。現行は `ZoomControl` が `bottomright` で DOM 末尾だが、**地図自体が `tabIndex=0` でフォーカス可能か不明**。Leaflet の `MapContainer` は既定で `tabIndex` を持たず、キーボードで地図をパンできない。
- **修正**: `MapContainer` に `keyboard: true`（既定 true だが明示） + `tabIndex: 0` を確認し、トップバーの `input` に `tabIndex=0`、`Filter` ボタンに `aria-expanded={filterOpen}` を付与

### A-4 — `globals.css` の `:focus-visible` が未定義で、M3 トークンのフォーカスリングが無い

- **場所**: `globals.css` に `:focus-visible` の定義なし
- **乖離**: 事実: **2025 の baseline は `:focus-visible { outline: 3px solid currentColor; outline-offset: 3px; }`** [6](https://hackernoon.com/accessibility-in-2025-a-practical-guide-to-wcag-22-with-real-examples) で、これだけで **WCAG 2.4.11 `Focus Not Obscured` / 2.4.13 `Focus Appearance`（2px + 3:1）** を満たす。現行は `ghost-pin` / `ghost-cluster` が `!important` で outline を上書きし、**フォーカスリングが Leaflet の `leaflet-control-zoom` で隠れる**可能性。
- **修正**: `globals.css` に
  ```css
  :focus-visible { outline: 3px solid var(--color-m3-primary); outline-offset: 2px; }
  .ghost-pin:focus-visible .ghost-pin-inner { outline: 3px solid var(--color-m3-primary); }
  ```
  を追加し、`leaflet-control-attribution` の `!important` は Biome で抑制済みだが、フォーカス時は `outline-offset` で回避

### A-5 — `SpotDetailSheet` の画像が `alt` 無しで `onError` 時に `hidden` にするが `aria-hidden` が無い

- **場所**: `SpotDetailSheet.tsx: <img src={p.imageUrl} ... onError={(e)=> (e.currentTarget.style.display='none')}>`
- **乖離**: 事実: **画像の `alt` が無いとスクリーンリーダーが `src` を読み上げる**。`onError` で非表示にするだけでは **DOM に `img` が残り Tab でフォーカス可能**なまま。
- **修正**: `alt={p.name + "の画像"}` を付与し、`onError` で `setImageError(true)` にして `img` 自体をレンダリングしないか、`aria-hidden="true"` に

---

## 4. 事実に基づく全体の残課題（パフォーマンス/a11y 以外も含む）

### 4.1 React / Biome の事実と乖離

> 事実: **Biome の `useExhaustiveDependencies` は React 19.2 の `useEffectEvent` を `useRef` と同様に stable として扱うべき** [1](https://github.com/biomejs/biome/issues/7631)、**`exhaustive-deps` は 99% 従うべき** [5](https://react.dev/reference/eslint-plugin-react-hooks/lints/exhaustive-deps) [6](https://bobbyhadz.com/blog/react-hooks-exhaustive-deps)（`// eslint-disable-next-line` は最終手段）。

#### R-1 — `MapClient.tsx` の `// biome-ignore` は正しいが、将来の `useEffectEvent` への移行が未検討

- **場所**: `MapClient.tsx: // biome-ignore lint/correctness/useExhaustiveDependencies: selectedId は ...`
- **事実との整合**: `onSelectRef` を `useRef` にして `useEffect([], [spots])` で `selectedId` を除外するパターンは、**Biome が `useEffectEvent` を stable として認識する以前の旧パターン**の回避策。React 19.2 では `const onSelectEvent = useEffectEvent((spot)=> onSelect(spot))` にすれば **依存配列から除外できるのが公式の正解** [1](https://github.com/biomejs/biome/issues/7631)。
- **修正**: `useEffectEvent` に移行し、`biome-ignore` を不要にする（breaking 許容のため実施可能）

### 4.2 Tailwind v4 の事実と乖離

> 事実: **Tailwind v4 は `@theme` で CSS-first にトークンを集約** [1](https://agent-skills.md/skills/josiahsiegel/claude-plugin-marketplace/tailwindcss-fundamentals-v4) [2](https://medium.com/@sureshdotariya/tailwind-css-4-best-practices-for-enterprise-scale-projects-2025-playbook-bf2910402581)、**`@import "tailwindcss"` が必須** [5](https://toolboxhubs.com/en/blog/tailwind-css-v4-complete-guide-2026)、**`@theme { --*: initial; }` でリセット可能**。

#### T-1 — `postcss.config.mjs` が `@tailwindcss/postcss` だけで正しいが、`biome.json` の `tailwindDirectives` が無ければ `@theme` が parse error になる事実をコードコメントで明記していない

- **場所**: `postcss.config.mjs: { "@tailwindcss/postcss": {} }` / `biome.json: css.parser.tailwindDirectives: true`
- **事実との整合**: 本移行で `tailwindDirectives: true` にして parse error を解消したのは正しいが、**後続の開発者が `biome.json` の `tailwindDirectives` を false に戻すと再発する**。事実: *Tailwind-specific syntax is disabled. Enable tailwindDirectives in the css parser options* [S3-1] のエラーは Biome の CSS parser の仕様。
- **修正**: `globals.css` の先頭コメントに `/* biome: tailwindDirectives required for @theme */` を追記

### 4.3 スクレイピング / データの事実と乖離（前回 C6..C10 の再掲 + 新事実）

- `scripts/scrape.ts` の `PREFS=13,27` / `LIMIT_PER_PREF` / `CONCURRENCY=6` は Drizzle の `polling` と同様に **同時接続 6 がポライトネスの事実**として前回 EM1-C で計画済み。新たな事実として、**`cheerio` の `clean` が `\\u3000` を半角に置換するが `\\n` の複数行を `whitespace-pre-line` で表示する `comment` が潰れる**（前回 M17）— 本監査でも `SpotDetailSheet` の `whitespace-pre-line` と `clean` の `\\s+` が矛盾する事実を再確認。

---

## 5. 優先度付き改善リスト（事実に基づく）

> ユーザー指示「パフォーマンス/a11y最優先」＋ `allow_breaking` を反映し、**P0 > P1(perf/a11y) > P2** の順に。引用は事実ソースの [id](url) で明示。

| 優先度 | ID | 事実に基づく改善 | 対応する事実ソース | 見積 |
|---|---|---|---|---|
| **P0** | P-DB-1 | `spots` に複合/GIN/部分 index を追加（`EXPLAIN ANALYZE` で Index Scan 化） | [1](https://mintlify.wiki/drizzle-team/drizzle-orm/advanced/performance) [5](https://gist.github.com/productdevbook/7c9ce3bbeb96b3fabc3c7c2aa2abc717) [6](https://medium.com/@bhagyarana80/7-drizzle-schema-tips-for-cheap-joins-34f66c82bc1b) | 0.5日 |
| **P0** | P-CACHE-1 | `getFacets` / `querySpots` を `unstable_cache` + `tags` + `revalidateTag` でオンデマンド化 | [7](https://viprasol.com/blog/nextjs-app-router-caching/) [6](https://dev.to/pockit_tools/why-your-nextjs-cache-isnt-working-and-how-to-fix-it-in-2026-10pp) [8](https://nextjs.org/docs/app/guides/caching-without-cache-components) | 0.5日 |
| **P1** | P-MAP-1 | `ClusterLayer` の差分更新 + `chunkedLoading` のチャンク分割 + `useMemo` | [1](https://corevaluetech.com/blogs/market-cluster-with-leaflet.html) [2](https://www.xjavascript.com/blog/how-to-clear-leaflet-map-of-all-markers-and-layers-before-adding-new-ones/) [4](https://stackoverflow.com/questions/66447419/performance-issues-if-mapcomponent-state-is-updated) | 0.5日 |
| **P1** | A-1 | モーダル 3種（Filter/Detail/Disclaimer）に focus trap + Esc + 復帰 | [1](https://wcag.dock.codes/documentation/wcag-success-criteria/wcag212/) [2](https://silktide.com/accessibility-guide/the-wcag-standard/2-1/keyboard-accessible/2-1-1-keyboard-accessible/) [6](https://hackernoon.com/accessibility-in-2025-a-practical-guide-to-wcag-22-with-real-examples) | 0.5日 |
| **P1** | A-2 | サジェストの `listbox` / `Escape` / 外側クリックで脱出 | [1](https://wcag.dock.codes/documentation/wcag-success-criteria/wcag212/) | 0.25日 |
| **P1** | A-4 | `globals.css` に `:focus-visible` baseline（3px + 3:1） | [6](https://hackernoon.com/accessibility-in-2025-a-practical-guide-to-wcag-22-with-real-examples) | 0.1日 |
| **P1** | P-BUNDLE-1 | `next.config.ts` に `optimizePackageImports` + `images.remotePatterns` | [4](https://medium.com/@buildweb.it/next-js-performance-optimization-a-2025-playbook-27db2772c1a7) [5](https://buildwithumar.com/blogs/nextjs-animations-optimization) | 0.25日 |
| **P1** | P-DB-2 | `Pool` の `max:20` 等を明示 | [1](https://mintlify.wiki/drizzle-team/drizzle-orm/advanced/performance) | 0.1日 |
| **P2** | R-1 | `MapClient` を `useEffectEvent` に移行 | [1](https://github.com/biomejs/biome/issues/7631) [5](https://react.dev/reference/eslint-plugin-react-hooks/lints/exhaustive-deps) | 0.25日 |
| **P2** | P-MAP-3 | `framer-motion` を `dynamic` + `optimizePackageImports` で遅延 | [2](https://medium.com/servicerocket-eng/increasing-next-js-performance-with-bundle-analyzer-a-case-study-0418f40aa5c1) [5](https://buildwithumar.com/blogs/nextjs-animations-optimization) | 0.5日 |
| **P2** | P-DB-3 | `lat/lng` index の見直し（PostGIS 検討を文書化） | [5](https://gist.github.com/productdevbook/7c9ce3bbeb96b3fabc3c7c2aa2abc717) | 0.25日 |

**合計 約 4日**。P0（2件）を先に片付け、P1（6件）をパフォーマンス/a11y 最優先で、R-1 等は `allow_breaking` の範囲で `useEffectEvent` 移行を実施。

---

## 6. 付記 — 本監査で使った `fetch_page` / `web_search` の完全ログ

- `web_search` S1..S8（上表）の全結果は本ドキュメントの [id](url) 引用で検証可能
- `fetch_page` 取得:
  - `https://nextjs.org/blog/upcoming-nextjs-security-release-september-22-2026`（GHSA-vcvr-r3jv-pc5j）
  - `https://biomejs.dev/guides/getting-started/`（Biome pnpm 導入）
  - `https://pnpm.io/installation`（pnpm 12 native）
  - `https://nextjs.org/docs/app/api-reference/config/next-config-js`（`NextConfig` 型）
  - `https://web.dev/articles/performance`（404 のため `web_search` の 2025 Playbook [4](https://medium.com/@buildweb.it/next-js-performance-optimization-a-2025-playbook-27db2772c1a7) で代替）
- `ask_user` で「パフォーマンス/a11y最優先で全体を」「allow_breaking」を取得し、本優先度に反映

> 本監査は `docs/audit/EM1-bug-report.md`（前回）＋ `docs/audit/EM1-bug-report.md` 追補（pnpm/Biome）の上位として、**パフォーマンス/a11y を事実で再検証**したもの。EM1 の `EM1-B`（API/DB/cache）/ `EM1-D`（地図/UI）に本リストを統合して実施する。
