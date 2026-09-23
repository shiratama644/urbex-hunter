-- Phase 2 DB-2: pg_trgm + GIN indexes for ilike and array search
-- 適用は手動で transaction 外で実行すること（CONCURRENTLY は transaction 内で不可）[1](https://ecosire.com/blog/drizzle-migrations-zero-downtime)
-- 事実: GIN は ilike '%q%' で 22ms vs 268ms seq scan [1](https://imhoratiu.wordpress.com/2026/01/01/postgresql-trigram-similarity-vs-pattern-matching-a-performance-comparison/)

-- 1. 拡張（1回のみ）
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. ilike 高速化（name/kana/address の部分一致）
CREATE INDEX CONCURRENTLY IF NOT EXISTS spots_name_trgm_idx ON spots USING gin (name gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS spots_kana_trgm_idx ON spots USING gin (kana gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS spots_address_trgm_idx ON spots USING gin (address gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS spots_city_trgm_idx ON spots USING gin (city gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS spots_pref_trgm_idx ON spots USING gin (prefecture gin_trgm_ops);

-- 3. phenomena 配列の @> / unnest 高速化
CREATE INDEX CONCURRENTLY IF NOT EXISTS spots_phenomena_gin_idx ON spots USING gin (phenomena);

-- 4. 複合（必要に応じて — bbox + genre の選択性が高い場合）
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS spots_bbox_genre_idx ON spots (genre, lat, lng);
