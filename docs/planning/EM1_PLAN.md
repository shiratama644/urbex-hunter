# EM1: Bug fixes — 監査 P0/P1 全解消 + P2 選別

> 対応 task-list ID: `EM1-A`〜`EM1-F` (`docs/task-list.md` Phase EM1)  
> 計画書テンプレート: `docs/planning/_TEMPLATE.md` 準拠  
> 監査報告書: `docs/audit/EM1-bug-report.md`（2026-09-22）  
> 関連仕様: `docs/arch/adr.md`・`docs/arch/data-model.md`・`docs/arch/api.md`・`docs/arch/scraping.md`・`AGENTS.md` §6 / `.agent/skills/tech-stack/SKILL.md`

## 1. 開始前確認

- 現在のブランチ `arena/01a0c903-urbex-hunter` / HEAD `2b2bd43` / `git status` clean を確認する（未コミット変更があれば停止）
- `docs/task-list.md` で `SETUP-0`〜`SETUP-5` が完了（100%）であることを確認する
- `docs/audit/EM1-bug-report.md` の全 49 件（C1..C10 / H1..H22 / M1..M18 / L1..L9）を再読する
- `docs/arch/adr.md` の「まだ決めていない事項」4件と本計画の整合を確認する
- 本計画書 §5（完了条件）と §7（停止条件）を再読する

## 2. 目的 (Why)

`nextjs-ghost-map-application.zip` 展開直後のコードは `npm run build` は疎通するものの、`npm audit` で Next.js に Critical RCE（`GHSA-p293-qw3h-jr36` / `GHSA-2xp9-vwfh-vxw4` 等 9件）が残存し、API の入力検証・キャッシュ・スクレイパーの堅牢性・UI の a11y に High レベルの欠陥がある。本フェーズで **P0（Critical）10件と P1（High）22件を全解消**し、P2（Medium）18件を選別対応することで、Phase 1〜5 を安全に進められる土台を作る。

## 3. 変更範囲 (Scope)

変更対象:

- `package.json` / `drizzle.config.json` → `drizzle.config.ts` / `next.config.ts` / `postcss.config.mjs` / `tsconfig.json`（設定のみ）
- `src/db/index.ts` / `src/lib/spots-repo.ts` / `src/app/api/spots/route.ts` / `src/app/api/spots/[id]/route.ts` / `src/app/api/facets/route.ts` / `src/app/page.tsx` / `src/app/error.tsx` / `src/app/loading.tsx` / `src/app/not-found.tsx` / `src/app/sitemap.ts` / `src/app/robots.ts`
- `src/components/GhostMapApp.tsx` / `src/components/Map/MapClient.tsx` / `src/components/FilterPanel.tsx` / `src/components/SpotDetailSheet.tsx` / `src/components/DisclaimerDialog.tsx` / `src/app/globals.css` / `src/app/layout.tsx`
- `scripts/scrape.ts` / `scripts/seed.ts` / `data/spots.geojson`（`count` / `generatedAt` の整合のみ）
- `.github/workflows/scrape_update.yml` / `.github/workflows/quality-gates.yml`（新規・提案）
- `docs/arch/*` / `docs/audit/EM1-bug-report.md` / `docs/planning/EM1_PLAN.md` / `README.md` / `.env.example`（新規）
- `vitest.config.ts` / `src/lib/spots-repo.test.ts` 等テスト基盤（EM1-F のみ）

変更しない（境界外）:

- `data/spots.geojson` の 752 件の実データ内容（座標・名称等）を恣意的に書き換えない（`count` 付与のメタのみ）
- DB スキーマ（`src/db/schema.ts`）の列追加・削除（index 追加の検討は `docs/arch/data-model.md` への記録に留める）
- スクレイピングのポライトネスを弱めない（同時接続 6 / UA 維持 / リトライ間隔は維持し、むしろ統一する）
- `src/app/globals.css` の M3 トークン命名を勝手に変えない（追加のみ）
- Phase 1〜5 本来の機能（新規地図表現・E2E 全体等）は本フェーズでは行わない

## 4. 禁止事項

- 不明点は推測で埋めず、§7 の停止条件に従って質問する
- `docs/arch/adr.md` に反する実装をしない（DB を PostgreSQL 以外に変えない等）
- `src/app/globals.css` の M3 トークン命名を勝手に変えない
- `data/spots.geojson` のマージ挙動を壊さない（`spotcd` の重複排除は最新が勝つ不変条件を守る）
- スクレイピングのポライトネス（同時接続6 / UA / 待機）を弱めない
- 脆弱性修正で `npm audit fix --force` を無差別に実行しない（`next@16.3.5` は個別 bump、`drizzle-kit` は `overrides` で対応）

## 5. 完了条件 (DoD)

### EM1 全体

- [ ] `docs/audit/EM1-bug-report.md` の **C1..C10 / H1..H22 が 0件残存**（各サブタスクの DoD で個別に証明）
- [ ] `npm run typecheck` / `npm run lint` / `npm run build` 全 pass（警告 0。`next build` は DB 無しでも GeoJSON 経路で pass）
- [ ] `npm audit --production` で `critical:0` / `high:0`（`drizzle-kit` の `esbuild` は `overrides` か `dev` 除外で `moderate` 以下）
- [ ] `docs/task-list.md` の EM1-A..F が `完了` / `実績と証拠` が記載
- [ ] タスク範囲外のファイル（`.archive/` を含む）に意図しない変更がない

### EM1-A — パッケージ・設定の是正

- [ ] `package.json:name` が `urbex-hunter`、`description/keywords/repository` が記載
- [ ] `next@16.3.5` `eslint-config-next@16.3.5` に bump、`drizzle-kit@0.31.11`（or latest）に bump
- [ ] `drizzle.config.json` → `drizzle.config.ts` に移行し `process.env.DATABASE_URL` を優先
- [ ] `next.config.ts` に `images.remotePatterns`（`ghostmap.jp`）が記載
- [ ] `.env.example` が存在、`README.md` からリンク
- [ ] `.github/workflows/quality-gates.yml` 提案（`typecheck/lint/build/test`）が `docs/ops/` か `.github/` に存在

### EM1-B — API / DB / キャッシュの堅牢化

- [ ] `parseBbox` が `-180..180` / `-90..90` に clamp し、逆転を正規化
- [ ] `limit` が `1..3000` に clamp、`q` が 100文字で truncate
- [ ] `readGeoJson` がメモ化（`mtime` で invalidate、5分以内は再読み込みしない）
- [ ] `getFacets` が `unstable_cache`（or インメモリ）で 1時間 cache、DB 4クエリ/リクエストを解消
- [ ] `page.tsx` が `Promise.allSettled` + fallback、`src/app/error.tsx` が存在
- [ ] 簡易 rate-limit（60 req/min / IP、メモリ）が `/api/spots` に雛形として存在

### EM1-C — スクレイパーの堅牢化

- [ ] `pool` の共有カーソル競合が解消（`p-limit` 相当か `chunk` 方式）
- [ ] 出力 GeoJSON に `count` と `generatedAt` が必ず含まれる
- [ ] `listSpotIds` がページネーション（`p=2` 以降が空になるまで）に対応
- [ ] `lat/lng` 抽出が 3パターン（`maps?q=` / `"latitude"` JSON / `data-lat`）に対応
- [ ] `th` パースが前方一致、`imageUrl` が `https` 強制、`og:image` fallback、改行保持・全角数字対応

### EM1-D — 地図・UI/UXの磨き

- [ ] `GhostMapApp` の bbox pad が clamp、`openSpot` が Abort、`suggestOpen` が外側クリック/ESC で閉じる
- [ ] `MapClient` の cluster が差分更新（全再構築しない）か `requestIdleCallback` で分割
- [ ] `page.tsx` の初期 `limit` が 500 程度に縮小（ADR に記録）
- [ ] `layout.tsx` の `maximumScale:1` が除去
- [ ] `RATINGS` と `fearTone` の閾値が統一（ADR に記録）
- [ ] `src/app/error.tsx` / `loading.tsx` / `not-found.tsx` / `sitemap.ts` / `robots.ts` が存在、フィルタ永続化（URL クエリ）が動作

### EM1-E — ドキュメント・仕様の整合

- [ ] `docs/task-list.md` の SETUP-5 が 100%（本計画で既に反映）、EM1 が完了扱い
- [ ] `docs/arch/legal.md` と `DisclaimerDialog` の文言が一致
- [ ] `docs/arch/ui.md` / `product.md` / `data-model.md` に 500 制限・トークン・座標フォールバックが明記

### EM1-F — テスト・品質ゲートの土台

- [ ] `vitest` + `@testing-library/react` + `jsdom` 導入、`npm run test` が pass
- [ ] `src/lib/spots-repo.test.ts`（`parseBbox` / `filterGeoJson` / `fearTone`）が存在し pass
- [ ] `quality-gates.yml` が CI で `test` を実行

## 6. テスト方法

| 層 | 実施 | 確認内容 |
|---|---|---|
| Unit (vitest) | EM1-F で `npm run test` | `parseBbox` の clamp/逆転/NaN、`filterGeoJson` の bbox/genre/pref/q/limit、`fearTone` 閾値 |
| Component (testing-library) | EM1-D で任意 | `GhostMapApp` の bbox memo、`FilterPanel` の RATINGS、`DisclaimerDialog` の localStorage |
| API 手動 (curl) | EM1-B で必須 | `curl '/api/spots?bbox=999,999,999,999&limit=-5&q=a...1000字'` が 500 にならない・clamp される、`X-RateLimit-*` ヘッダ |
| スクレイパー手動 | EM1-C で必須 | `PREFS=13 LIMIT_PER_PREF=2 npm run scrape` で `count` が出力され、`og:image` fallback が動く |
| 地図手動 | EM1-D で必須 | `npm run dev` で bbox 移動→ API 再取得が jank しない、サジェストが外側クリック/ESC で閉じる、`maximumScale` が 5 以上 |
| E2E (Playwright / CI) | Phase 5 本番。EM1 では discovery のみ | — |
| 実環境 | EM1 完了後に Vercel Preview で `npm run build` pass | `npm audit --production` で critical 0 |

検証コマンド（各サブタスク末尾で再実行）:

```bash
npm run typecheck
npm run lint
npm run build
npm audit --production
# EM1-F 以降
npm run test
```

## 7. 停止条件

次の場合は作業を停止し、変更せず報告する:

- 仕様書（本計画書・`docs/arch/*`・`AGENTS.md`・`.agent/skills/*`）同士に矛盾がある
- `docs/task-list.md` 記載の変更範囲を超える変更が必要（例: DB スキーマ変更が必要になった）
- 破壊的変更が必要（API 契約の破壊的変更・`data/spots.geojson` の全再取得 752 件を CI で必須にする等）
- `next@16.3.5` への bump で `next build` が壊れ、回避に 1日以上かかる見込み
- `drizzle-kit` の `esbuild` 問題で `drizzle-kit push` が動かなくなる
- `ghostmap.jp` の HTML 構造が本計画の想定と大きく乖離し、`parseSpot` の 3パターンでも座標が取れない
- ユーザー判断が必要な設計論点に到達した（例: `RATINGS` を 4.3 のままか 4.2 に統一するかでプロダクト判断が必要）
- 開始時点で作業ツリーに未確認の変更がある（`git status` が clean でない）

## 8. 完了時に行うこと

1. 差分を自己レビュー（`git diff --stat` / `git diff`）
2. 検証を実行（§6 のコマンド + 手動確認）
3. `docs/task-list.md` の EM1-A..F の状態・進捗・証拠を更新
4. タスク ID を含むコミット（例: `fix(EM1-A): bump next to 16.3.5 and rename package`）
5. 証拠中心の完了報告（`npm audit` 結果 / `npm run build` ログ / `curl` 結果を添付）
6. `docs/planning/EM1_PLAN.md` の §12（実績と証拠）を記入し、`docs/planning/complete/EM1_PLAN.md` へ移動（`_TEMPLATE.md` §6 準拠）

## 9. サブタスク分割

| ID | テーマ | 主要成果物 | 依存 | 見積 | 監査ID |
|---|---|---|---|---|---|
| EM1-A | パッケージ・設定の是正 | `package.json` / `drizzle.config.ts` / `next.config.ts` / `.env.example` / `quality-gates.yml` | SETUP-5 | 0.5日 | C1,C2,C3,C8,H13,H14,H20,M3,M4,M11 |
| EM1-B | API / DB / キャッシュの堅牢化 | `src/lib/spots-repo.ts` / `src/app/api/spots/route.ts` / `src/app/page.tsx` / `error.tsx` / rate-limit | EM1-A | 1日 | C4,C5,H1,H2,H3,H4,H5,C7,H22,M5,M6 |
| EM1-C | スクレイパーの堅牢化 | `scripts/scrape.ts` / `scripts/seed.ts` / `data/spots.geojson` | EM1-A | 0.5日 | C6,C7,H15,H16,H17,H19,M16,M17,M18 |
| EM1-D | 地図・UI/UXの磨き | `GhostMapApp.tsx` / `MapClient.tsx` / `SpotDetailSheet.tsx` / `sitemap.ts` / `robots.ts` / `loading.tsx` | EM1-B | 1日 | C10,H6,H7,H8,H9,H10,H11,H21,M1,M2,M7,M8,M12,M13,M14 |
| EM1-E | ドキュメント・仕様の整合 | `docs/arch/*.md` / `README.md` | EM1-A | 0.25日 | L7,L9,H10,H13,M9,M13 |
| EM1-F | テスト・品質ゲートの土台 | `vitest.config.ts` / `src/lib/spots-repo.test.ts` / `package.json#scripts.test` | EM1-B | 0.5日 | M10,M11,H4 |

> 合計 3.75日。EM1-A/B/C は順次、D/E/F は B/C 完了後に並行可能。

## 10. 設計詳細・仕様

### EM1-A — パッケージ

- `package.json`:
  ```json
  { "name": "urbex-hunter", "description": "全国心霊マップ Explorer — ghostmap.jp 由来 752件の心霊スポットを探索する非公式地図", "keywords": ["urbex","ghostmap","nextjs","leaflet"] }
  ```
- `next@16.3.5` / `eslint-config-next@16.3.5` に bump。`drizzle-kit@0.31.11` に bump。`drizzle.config.json` → `drizzle.config.ts`:
  ```ts
  import { defineConfig } from "drizzle-kit";
  export default defineConfig({
    dialect: "postgresql",
    schema: "./src/db/schema.ts",
    out: "./drizzle",
    dbCredentials: { url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/app_db" },
  });
  ```
- `next.config.ts`:
  ```ts
  images: { remotePatterns: [{ protocol: "https", hostname: "ghostmap.jp" }, { protocol: "https", hostname: "*.ghostmap.jp" }] }
  ```
- `overrides`（`drizzle-kit` の `esbuild` 問題）: `package.json` に `"overrides": { "esbuild": "^0.25.0" }` を追加するか、`npm audit --production` で `dev` 除外を ADR に記録（`overrides` は `npm` 10+ で有効）。

### EM1-B — API / DB

- `parseBbox(raw)`:
  ```ts
  function clamp(v:number, lo:number, hi:number){ return Math.max(lo, Math.min(hi, v)); }
  function parseBbox(raw:string|null){
    if(!raw) return undefined;
    const [a,b,c,d] = raw.split(",").map(Number);
    if([a,b,c,d].some(Number.isNaN)) return undefined;
    let [minLng, minLat, maxLng, maxLat] = [a,b,c,d];
    if(minLng>maxLng) [minLng,maxLng]=[maxLng,minLng];
    if(minLat>maxLat) [minLat,maxLat]=[maxLat,minLat];
    return [clamp(minLng,-180,180), clamp(minLat,-90,90), clamp(maxLng,-180,180), clamp(maxLat,-90,90)] as const;
  }
  ```
- `limit`: `const n = Number(searchParams.get("limit")); const limit = Number.isFinite(n) ? Math.max(1, Math.min(3000, Math.trunc(n))) : undefined;`
- `q`: `const q = searchParams.get("q")?.trim().slice(0,100) || undefined;`
- `readGeoJson` のメモ化:
  ```ts
  let cache:{mtimeMs:number, data:SpotCollection}|null=null;
  async function readGeoJson(){
    const stat = await fs.stat(GEOJSON_PATH);
    if(cache && cache.mtimeMs===stat.mtimeMs) return cache.data;
    const data = JSON.parse(await fs.readFile(GEOJSON_PATH,"utf8"));
    cache = {mtimeMs: stat.mtimeMs, data};
    return data;
  }
  ```
- `getFacets` の cache: `import { unstable_cache } from "next/cache"; export const getFacets = unstable_cache(_getFacets, ["facets"], { revalidate: 3600 });`
- `page.tsx`: `const [spotsRes, facetsRes] = await Promise.allSettled([querySpots({limit:500}), getFacets()]);` + fallback。
- rate-limit 雛形: `src/lib/rate-limit.ts`（`Map<string,{count,reset}>`、60/min、テスト時は無効化）。

### EM1-C — スクレイパー

- `pool` の書き直し:
  ```ts
  async function pool<T>(items:T[], concurrency:number, worker:(item:T, idx:number)=>Promise<void>){
    const queue = items.map((item, idx) => ({item, idx}));
    const runners = Array.from({length: concurrency}, async () => {
      while(queue.length){
        const cur = queue.shift()!; await worker(cur.item, cur.idx);
      }
    });
    await Promise.all(runners);
  }
  ```
  あるいは `p-limit` 無しで `chunk` 方式に。`out` は `idx` 付きで `Map<spotcd, SpotFeature>` に直接 `set` し、疎配列を避ける。
- `listSpotIds`: `for(let p=1;;p++){ const html = await fetchHtml(`${BASE}/spotlist.php?precd=${precd}&p=${p}`); const ids = [...html.matchAll(/spotdetail\.php\?spotcd=(\d+)/g)].map(m=>Number(m[1])); if(!ids.length) break; all.push(...ids); if(ids.length<16) break; }`（1ページ16件想定、空で終了）。
- `lat/lng` 3パターン: `maps\?q=` → `"latitude"\s*:\s*(-?\d+\.\d+)` → `data-lat=["'](-?\d+\.\d+)["']`。
- `th` 前方一致: `const row = [...tr].find(r=> clean(r.th).startsWith("読み方"));`
- `imageUrl`: `url.replace(/^http:/,"https:")` + `og:image` fallback: `html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/)`。

### EM1-D — UI

- `GhostMapApp` の bbox clamp: `const clampBbox = (b:Bbox):Bbox => [Math.max(-180,b[0]), Math.max(-90,b[1]), Math.min(180,b[2]), Math.min(90,b[3])];`
- `openSpot` の Abort: `const acRef = useRef<AbortController|null>(null);` で `acRef.current?.abort()` → 新 `AbortController`。
- サジェスト外側クリック: `useEffect(()=>{ const h=(e:MouseEvent)=>{ if(!ref.current?.contains(e.target as Node)) setSuggestOpen(false); }; document.addEventListener("mousedown",h); return ()=>document.removeEventListener("mousedown",h); },[]);`
- `MapClient` の差分更新: `useEffect` 内で `prevSpotsRef` と比較し、`addLayers` は新規のみ、`removeLayer` は削除のみ。初回は `clearLayers`。
- `layout.tsx`: `maximumScale` を削除（既定は制限なし）。
- `RATINGS` vs `fearTone`: `RATINGS = [0,3,3.6,4.2]` に統一し、`fearTone` と一致させる（ADR に記録）。

### EM1-E — ドキュメント

- `docs/arch/api.md` に `bbox clamp` / `limit 1..3000` / `q 100文字` を追記
- `docs/arch/data-model.md` に `count` の必須化と `pg_trgm` 検討を追記
- `docs/arch/legal.md` と `DisclaimerDialog.tsx` の 3 ITEMS の文言を一語一句一致させる

### EM1-F — テスト

- `vitest.config.ts`（`environment: "jsdom"`、`include: ["src/**/*.test.ts"]`）
- `src/lib/spots-repo.test.ts`:
  ```ts
  describe("parseBbox", ()=>{ it("clamps",()=>{...}); it("swaps min/max",()=>{...}); });
  describe("filterGeoJson", ()=>{ it("filters by bbox",()=>{...}); });
  ```

## 11. リスク・Gotchas

| リスク | 影響 | 緩和 |
|---|---|---|
| `next@16.3.5` で `next build` が壊れる | リリース不能 | bump は `16.3.5` のみに限定し、`npm run build` を EM1-A 末尾で即検証。壊れたら `16.2.11`（High まで修正）で妥協 |
| `drizzle-kit` の `esbuild` が `overrides` で壊れる | `drizzle-kit push` が失敗 | `overrides` は任意。`npm audit --production` で `dev` 除外する運用でも可 |
| `ghostmap.jp` の HTML 変更で scrape が全滅 | GeoJSON が空 | `parseSpot` は 3パターンで liveness を上げ、`listSpotIds` のページネーションは `p=1` のみでも動くように fallback |
| B案の `readGeoJson` cache が `mtime` で invalidate しない（FS 精度） | 古い GeoJSON を返し続ける | `stat.mtimeMs` + `size` の両方で比較 |
| `unstable_cache` が Serverless で効かない | DB 4クエリ/リクエストが残る | `unstable_cache` が無効でも `readGeoJson` cache で GeoJSON 経路は軽量化。DB 経路は `getFacets` を 1時間の `revalidate` で代替 |

## 12. 実績と証拠（実装後に記入）

| ID | コミット | テスト | 実測値・備考 |
|---|---|---|---|
| EM1-A | | `npm audit --production` critical 0 | |
| EM1-B | | `curl /api/spots?bbox=999,999,999,999` が 200、`npm run build` pass | |
| EM1-C | | `npm run scrape -- PREFS=13 LIMIT_PER_PREF=2` で `count` が出力 | |
| EM1-D | | 手動: 外側クリックでサジェストが閉じる | |
| EM1-E | | `docs/arch/*` diff | |
| EM1-F | | `npm run test` pass | |
