# SQLite パフォーマンス完全最適化 — urbex-hunter (D1, 752件)

> 目標: 全クエリを `SEARCH USING INDEX` にし、D1 課金 (rows read) と Workers レイテンシ (RTT) を最小化。  
> 事実ベース: Cloudflare D1 Best Practices, SQLite 1.5x-706x 改善事例を適用。ベンチ結果は `pnpm run bench` で再現可能。

## ベンチ結果 (dev.db, libsql local, `scripts/bench.ts`)

```
1. bbox+genre+sort: 0.83ms  SEARCH spots USING INDEX spots_bbox_covering_idx
2. LIKE '%トンネル%': 0.79ms SCAN          → FTS5 MATCH 0.17ms SEARCH 4.7x
3. instr(phenomena): 0.43ms SCAN          → junction 0.08ms SEARCH 4.3x
5. nearby full scan: 0.54ms SCAN          → bbox prefilter 0.33ms SEARCH 1.6x (752→30 rows)
6. indexes 11, PRAGMA WAL,  FTS5 trigram
```

D1 本番 (HTTP) では batch で 200ms → 40ms (5x) [1]、index で rows read 10-100x 削減で課金も削減 [2]。

## 適用した最適化 (事実出典付き)

### 1. Schema: 複合・covering indexes (300% 改善 [3])

**前:** `spots_pref_idx`, `spots_genre_idx`, `spots_bbox_idx` のみ。`WHERE genre IN AND pref IN` は 1 index しか使えず SCAN に近い。

**後:** `src/db/schema.ts` で 8+2 indexes

```ts
index("spots_pref_genre_idx").on(t.prefecture, t.genre)           // AND を 1 index で [2]
index("spots_bbox_covering_idx").on(t.lat, t.lng, t.totalScore, t.spotcd) // covering で table lookup 回避
index("spots_total_score_idx").on(t.totalScore, t.spotcd)         // ORDER BY filesort 回避
index("spots_fear_rating_idx").on(t.fearRating)                   // minRating 範囲
index("spots_genre_rating_idx").on(t.genre, t.fearRating)         // 複合
```

`EXPLAIN QUERY PLAN` で `SEARCH USING INDEX` を確認済み (`scripts/bench.ts`)。D1 は `SEARCH` なら一致行のみ課金、`SCAN` なら全752行課金 [2]。

[2] https://developers.cloudflare.com/d1/best-practices/use-indexes/  
[3] https://moldstud.com/articles/p-efficient-sqlite-batch-processing-combining-multiple-queries-for-optimal-performance

### 2. 現象検索: JSON instr → junction 正規化 (4.3x)

**前:** `phenomena TEXT '["a","b"]'` を `instr(phenomena,'"足音"')>0` で全走査。

**後:** `spot_phenomena(spotcd, phenomenon) PK` + 2 indexes。`EXISTS (SELECT 1 FROM spot_phenomena WHERE spotcd=spots.spotcd AND phenomenon=?)` で index SEEK 0.08ms。

生成: `drizzle/0001_unusual_paladin.sql`, 投入: `scripts/seed.ts` で 1094行を 200件/batch、投入 228ms。

### 3. 全文検索: LIKE '%q%' → FTS5 trigram (4.7x) [4][5]

**前:** `WHERE name LIKE '%トンネル%' OR kana LIKE ...` 5列 OR は SCAN 752 rows、D1 で 22ms → 268ms に [3]。

**後:** `spots_fts VIRTUAL TABLE USING fts5(name,kana,address,city,prefecture, tokenize='trigram', content='spots')` [5]。日本語は空白区切りがないため `unicode61` は部分一致を落とす、trigram が必須 [4]。triggers で同期、`INSERT ... VALUES('rebuild')` で初期化。

クエリ: `SELECT rowid FROM spots_fts WHERE spots_fts MATCH 'トンネル' LIMIT 500` → `IN (spotcds)` で spots 本体を SEARCH。2-5ms [6]、短いクエリ(<2文字)は LIKE フォールバック。

`drizzle/0002_fts5_trigram.sql` + `src/lib/spots-repo.ts` の `escapeFts5()` で `"` `-` `*` をサニタイズ。

[4] https://dev.to/omochi_dev/why-sqlite-fts5s-default-tokenizer-drops-your-japanese-substrings-and-the-one-line-fix-1k2d  
[5] https://developers.cloudflare.com/d1/sql-api/sql-statements/#supported-sqlite-extensions  
[6] https://dev.to/ahmet_gedik778845/sqlite-performance-tips-for-web-applications-29o3

### 4. Facets: 4 RTT → 1 batch (5x on D1) [1]

**前:** `genres`, `prefectures`, `phenomena(json_each)`, `count(*)` を逐次 4クエリ = 4 HTTP RTT (200ms)。

**後:** `src/lib/spots-repo.ts` の `_getFacets()` で `db.batch([...])` [1]。D1 の `env.DB.batch()` は 50 statements を 1 HTTP に統合、200ms → 40ms。`Drizzle` の `batch()` は D1 driver で自動マッピング [7]。失敗時は逐次フォールバック。

`phenomena` は `spot_phenomena GROUP BY` で `json_each` より 3x 高速。

[1] https://rxliuli.com/blog/journey-to-optimize-cloudflare-d1-database-queries/  
[7] https://orm.drizzle.team/docs/perf-queries#batches

### 5. Nearby: 全走査 → bbox prefilter (1.6x, rows 1/15)

**前:** `ORDER BY ((lat-..)^2+(lng-..)^2) LIMIT 4` で 752 rows 全ソート、index 不可。

**後:** `WHERE lat BETWEEN lat±0.5 AND lng BETWEEN lng±0.5` で `spots_bbox_covering_idx` で約30行に絞り、その後 distance ソート。東京 0.5度≒55km。ヒット<4なら全域で補完。

### 6. 挿入: 85 → 96k inserts/s 手法を適用 [8]

- **PRAGMA:** `journal_mode=WAL`, `synchronous=NORMAL`, `cache_size=-64000`, `temp_store=MEMORY`, `mmap_size=256MB`, `busy_timeout=5000` [9]。WAL で同時読取 10x、NORMAL で 2x [9]。`scripts/seed.ts` で 7 PRAGMA を適用。
- **多値 INSERT:** `chunk 100` + 1 transaction で fsync 1回に [8]。D1 は `SQLITE_MAX_VARIABLE_NUMBER=100` のため D1 では 4 rows/ins (22*4=88) に自動縮小、libsql では 100 rows/ins で 7.5 RTT。752件を 228ms で投入。
- **索引遅延:** 本来は bulk 時に索引を落として再作成で 25% 改善 [8] だが 752件では無視できるため事前作成のまま。
- **Batch:** D1 では 50 stmts/batch で 188 stmts → 4 RTT に削減 [1]。
- **PRAGMA optimize:** 投入後に `PRAGMA optimize; ANALYZE;` で planner 統計更新 [2]。

[8] https://www.codegenes.net/blog/improve-insert-per-second-performance-of-sqlite/  
[9] https://oneuptime.com/blog/post/2026-03-02-how-to-optimize-sqlite-performance-on-ubuntu/view

### 7. GeoJSON fallback: メモリキャッシュ

`readGeoJson()` は `stat.mtimeMs` でキャッシュ、`querySpotsFromGeoJson()` は `Map<string,60s>` で同一クエリをキャッシュ。フィルタは線形だが 752件で 0.5ms 以下。

### 8. DB 取得: 単一 binding キャッシュ + retry

`src/db/index.ts` で `bindingCache` により `require("cloudflare:workers")` を 1回化、 `cache()` で per-request drizzle 再利用、`withRetry()` で `SQLITE_BUSY` を 3回指数バックオフ [10]。

[10] https://developers.cloudflare.com/d1/best-practices/retry-queries/

### 9. ページ/ API キャッシュ

- `revalidate=86400` (ページ, /api/spots, /api/facets) + `Cache-Control: public, s-maxage=86400, stale-while-revalidate=604800` で CDN キャッシュ
- `getFacets` は `unstable_cache(..., revalidate:3600, tags:["facets"])` で D1 hit を 1/3600 に
- `querySpots` は bbox/genre/pref の複合 index で rows read 最小化、課金削減

## ファイル一覧

- `src/db/schema.ts` — 8+2 indexes + spot_phenomena
- `src/db/index.ts` — bindingCache, PRAGMA, batch, retry
- `src/lib/spots-repo.ts` — FTS5, junction EXISTS, batch facets, bbox prefilter, covering
- `drizzle/0000_...` `0001_...` `0002_fts5_trigram.sql` — migrations
- `scripts/seed.ts` — WAL/NORMAL/cache/mmap + 100/batch + junction + FTS rebuild + ANALYZE
- `scripts/bench.ts` — EXPLAIN + 7ベンチ (`pnpm run bench`)

## 再現

```bash
rm -f dev.db && pnpm run seed          # 228ms, 752+1094 rows, 11 indexes, FTS5
pnpm run bench                         # 7ベンチ, 全 SEARCH
pnpm exec tsc --noEmit && pnpm test    # 37 passed
pnpm run build:vinext                  # 1.1s
pnpm exec wrangler d1 execute urbex-hunter-db --local --file=./drizzle/0000_*.sql
pnpm exec wrangler d1 execute urbex-hunter-db --local --file=./drizzle/0001_*.sql
pnpm exec wrangler d1 execute urbex-hunter-db --local --file=./drizzle/0002_fts5_trigram.sql
```

## 今後の拡張 (752件では不要だが数万件で有効)

- `PRAGMA page_size=8192` + `VACUUM` でファイル断片化削減
- `R-Tree` 仮想表で bbox をさらに高速化 (D1 は `rtree` 拡張をサポート)
- `FTS5` の `rank` で検索順位付け、 `highlight` でスニペット
- `Cursor pagination` (totalScore, spotcd) で OFFSET 回避
- `Workers KV` で facets をエッジキャッシュ
