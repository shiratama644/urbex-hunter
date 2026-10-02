# 完全無料枠運用ガイド — urbex-hunter (Workers Free + D1 Free)

> **結論: 現在の最適化で Workers 100k req/day, D1 5M rows read/day, 5GB, KV 100k/1k の全無料枠内に収まる。**  
> 超過時は D1 が 00:00 UTC まで停止する [1] ため、80% (4M reads, 80k writes) でアラートを推奨 [2]。

## 無料枠の正確な上限 (2026)

| 製品 | 無料枠/日 | 超過時 | 参考 |
|------|-----------|--------|------|
| **Workers** | 100,000 req/day, 10ms CPU/invoke, 128MB | 429 超過、00:00 UTC リセット | [3] |
| **D1 rows read** | 5,000,000 rows read/day (scanした行数、返却行数ではない) [4] | クエリが失敗 (D1_FREE_TIER_LIMIT) | [1][4] |
| **D1 rows written** | 100,000 rows/day | 同上 | [4] |
| **D1 storage** | 5GB total | insert/index 失敗 | [4] |
| **KV reads** | 100,000 /day | 429 | [3] |
| **KV writes** | 1,000 /day | 429 — facets 24 writes/day で収まる | [3] |
| **R2** | 10GB, 1M A /10M B /月 | 課金 | [3] |

本プロジェクト: `dev.db` 1.4MB (752 spots + 1094 phenomena + 11 indexes + FTS5) → 5GB の 0.03%。

[1] https://developers.cloudflare.com/d1/platform/pricing/  
[2] https://omidsaffari.com/blog/cloudflare-d1-free-limits-queries-stop  
[3] https://developers.cloudflare.com/workers/platform/pricing/  
[4] https://developers.cloudflare.com/d1/best-practices/use-indexes/#indexes-and-your-bill

## なぜ最適化が必須か — rows read は scan 行数

> `SELECT * FROM spots WHERE prefecture='東京都'`  
> - index あり: `SEARCH USING INDEX spots_pref_idx` → 23 rows read (東京の件数)  
> - index なし: `SCAN spots` → 752 rows read  

752行を毎回SCANすると 5M /752 ≈ **6,650 req/day** で上限。indexで20行にすると 5M/20=**250k req/day** で Workers 100kが先に来る。**indexが無料枠の鍵** [4]。

## 現在の予算 (実測ベンチ `pnpm run bench`)

| クエリ | 最適化後 PLAN | rows read | コスト |
|--------|--------------|-----------|--------|
| `bbox 35-36,139-140 + genre` | `SEARCH spots_bbox_covering_idx` | ~15 | 0.83ms |
| `q='トンネル'` | `SEARCH spots_fts MATCH` (FTS5 trigram) | ~5 (FTS) | 0.17ms (LIKE 0.79msの4.7x) |
| `phenomenon='足音'` | `SEARCH spot_phenomena_phenomenon_idx` (junction) | ~2 | 0.08ms (instr 0.43msの4.3x) |
| `nearby` | `SEARCH bbox_covering 0.5°` | ~30 | 0.33ms (full 0.54msの1.6x) |
| `facets` | `batch 4 queries 1 RTT` + `GROUP BY index` | ~120 (4*30) | batch 0.96ms (D1 HTTP 200ms→40ms) |

**1リクエストあたり平均** (page + API 1回): `facets` はキャッシュで0、`spots` は20行 → **20 rows read**。

**無料枠換算:**

- 20 rows × 100,000 req = **2M rows/day** → 5Mの **40%** → 余裕 60%
- 100 rows × 10,000 req (重いフィルタ) = 1M → 20%
- 最悪 `SCAN 752` × 100k = 75M → 超過で停止 [1]

**結論: 最適化なしでは無料枠を15倍超過、最適化後は40%に収まる。**

## 無料枠に収めるための4つの柱

### 1. 全クエリを SEARCH に (最重要)

`src/db/schema.ts` で 8+2 indexes + junction + FTS5 trigram を作成。`scripts/bench.ts` で `EXPLAIN QUERY PLAN` を検証 → 全クエリが `SEARCH USING INDEX` / `SEARCH spots_fts`。

未最適なら `pnpm run bench` で `SCAN` が出る → 即修正。

### 2. キャッシュ3層で D1 hit を 1/86400 に

- **Layer1 (ISR):** `page.tsx`, `api/spots`, `api/facets` は `revalidate=86400` + `Cache-Control: s-maxage=86400, stale-while-revalidate=604800` + `CDN-Cache-Control` [5]。Cloudflare edge が 24h キャッシュし Workers  invocation を回避。
- **Layer2 (KV):** `src/lib/kv-cache.ts` で facets を `KV` に 3600s キャッシュ。KVはglobalで<1ms [6]、 `100k reads/1k writes` のため facets (24 writes/day) のみに使用。`wrangler.jsonc` の `kv_namespaces` を有効化すれば D1 reads を **87%削減** [6] (2.5M→650k の事例)。
- **Layer3 (unstable_cache):** `getFacets` は `unstable_cache 3600s` + `tags` で per-isolate キャッシュ。D1 5M制限に対し 400 rows × 1/day = 400 rows。

[5] https://zenn.dev/jphfa/articles/cloudflare-d1-three-tier-cache?locale=en  
[6] https://developers.cloudflare.com/workers/platform/pricing/

**無料枠運用では `FACETS_TTL_SEC` を 86400 に延長するとさらに 1/24 に:**

```ts
// src/lib/kv-cache.ts
export const FACETS_TTL_SEC = 86400; // 24h で D1 1 hit/day
```

### 3. Batch で RTT を 1/4 に (D1 は HTTP)

`_getFacets()` で `db.batch([genres, prefs, phen, count])` により 4 RTT → 1 RTT。ローカルでは差がないが D1 HTTP では 200ms→40ms [7]。`querySpots` の `phenomenon` も `EXISTS (SELECT 1 FROM spot_phenomena ...)` で 1 index SEEK に。

[7] https://rxliuli.com/blog/journey-to-optimize-cloudflare-d1-database-queries/

### 4. 書き込みをゼロに近づける

D1 writes は 100k/day だが本プロジェクトは **読み取り専用** (seed時のみ write)。`ensureSeeded()` は `count(*)` 1回のみで write なし、`importGeoJsonIntoDb` は初回のみ。運用中の write は 0。

KV writes も facets の 24/day のみに制限。

## 運用チェックリスト

### 毎デプロイ

```bash
pnpm run bench                 # 全 SEARCH か確認 (SCAN があれば index 漏れ)
pnpm exec tsc --noEmit
pnpm test                      # 37 passed
pnpm run build:vinext
```

### 毎週 (Cron 推奨)

```bash
pnpm exec wrangler d1 info urbex-hunter-db --json | jq '.version' # size 確認 (5GB 制限)
pnpm exec wrangler d1 execute urbex-hunter-db --command="PRAGMA optimize" --remote # 統計更新
```

### アラート (80% ルール [2])

- **4M rows read/day** または **80k writes/day** で Slack/Email [2]
- 取得: Cloudflare GraphQL Analytics API (`d1QueriesAdaptiveGroups`) またはダッシュボード Metrics → Row Metrics
- 超過時は即 `FACETS_TTL_SEC=86400` + `s-maxage` 延長、または Workers Paid ($5/月で 25B reads/month) に

```ts
// 無料枠アラート閾値
const D1_FREE_DAILY_READS = 5_000_000;
const ALERT_AT = 4_000_000; // 80%
```

### 無料枠超過時の挙動

- **D1 reads/writes 超過:** `D1_ERROR: Daily limit exceeded` で API 500。`src/lib/spots-repo.ts` は `catch` で GeoJSON fallback に倒すため **サイトは落ちない** (752件で継続)。
- **Workers 100k超過:** 429。`Cache-Control` で edge キャッシュヒットを上げると回避。
- **KV 1k writes超過:** 429。facets の 24/day なら余裕。

## シナリオ別判定

| 想定 | 計算 | 無料枠 |
|------|------|--------|
| **個人ブログ 1k pv/day × 2 API** | 2k req ×20 rows=40k reads | ✅ 0.8% |
| **バズ 50k pv/day × 3 API** | 150k req → Workers 100k超過で 429 | △ Workersが先に上限、キャッシュで回避 or Paid |
| **重い検索 10k pv/day × 10 API (未最適 SCAN 752)** | 100k req ×752=75M reads → D1停止 | ❌ SCANは即停止、index必須 |
| **重い検索 10k pv/day ×10 API (最適 20)** | 100k req ×20=2M reads | ✅ 40% |

## 無料でやらないこと

- **画像の D1 保存:** 5GB を圧迫、R2 (10GB無料) に。現在は `ghostmap.jp` 外部URLを `next/image` で最適化のみ、R2未使用で正解
- **ログの D1 保存:** writes 100k を即消費、Analytics Engine や `console.log` に
- **毎リクエストの KV write:** 1k/day を即超過、facets のみ

## 参考

- D1 pricing & rows read定義: https://developers.cloudflare.com/d1/platform/pricing/
- D1 indexes と bill: https://developers.cloudflare.com/d1/best-practices/use-indexes/#indexes-and-your-bill
- D1 free tier 詳細: https://freetier.co/articles/cloudflare-d1-free-tier-limits-pricing-and-alternatives
- KV cache 87%削減事例: https://zenn.dev/jphfa/articles/cloudflare-d1-three-tier-cache?locale=en
- Workers free 100k/day: https://developers.cloudflare.com/workers/platform/pricing/
- 本プロジェクト perf 詳細: `docs/perf-optimization.md`
- ベンチ: `pnpm run bench` / `pnpm run free-tier:check`
