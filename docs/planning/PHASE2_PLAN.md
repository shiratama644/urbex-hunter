# Phase 2: API / DB 強化 — facets 近隣 seed index

> 対応 task-list ID: `API-1` `API-2` `DB-1` `DB-2` (`docs/task-list.md` Phase 2)  
> 計画書テンプレート: `docs/planning/_TEMPLATE.md` 準拠  
> 関連仕様: `docs/arch/data-model.md` / `docs/arch/adr.md` ADR-004/008 / `docs/arch/api.md`

## 1. 開始前確認

- ブランチ `arena/01a0c903-urbex-hunter` / HEAD `d5f5695` / `git status` clean
- `docs/task-list.md` で `Phase 1 完了` / `EM1-A..F 完了` を確認
- `src/db/schema.ts`（3 index）/ `src/lib/spots-repo.ts`（buildConditions / getFacets / getNearby / ensureSeeded）/ `drizzle.config.ts` を再読
- `Phase 1` で `bbox.ts` 分離・`MapClient` 改善済みのため DB 層に集中できることを確認
- 本計画書 §5（完了条件）と §7（停止条件）を再読

## 2. 目的 (Why)

EM1-B で `parseBbox`/`limit`/`readGeoJson memo`/`getFacets unstable_cache 3600` は入ったが、DB 層は **最小 index（3つ）のみ**で `ilike '%q%'` が seq scan、`phenomena @> ` に GIN がなく、`nearby` の距離計算と `seed` の冪等性にテストがない。Phase 2 で **検索の I/O を GIN/trigram で 70% 削減** [2](https://archive.ph/VrCUS) し、近隣と seed の回帰をテストで防ぐ。

## 3. 変更範囲 (Scope)

変更対象:
- `src/db/schema.ts` — trigram 用 `pg_trgm` 拡張前提の `GIN (name gin_trgm_ops)` 等の index 定義を **コメント + 将来マイグレーション雛形**として追記（`CONCURRENTLY` は手動適用 [1](https://dev.to/whoffagents/zero-downtime-postgres-migrations-with-drizzle-orm-22ga) のため `drizzle/` の custom migration 雛形を `docs/arch/data-model.md` に記録）
- `src/lib/spots-repo.ts` — `buildConditions` の `ilike` を `pg_trgm` で高速化する分岐は DB 有り時のみ、_getFacets の `phenomena` 集計を `GIN` 前提にコメント、 `getNearby` の除外と limit のテスト容易化（pure helper 抽出）
- `src/lib/spots-repo.test.ts` — `API-2` 近隣 4件の距離・除外・ソートのユニットテスト、`DB-1` の `rowToFeature`/`filterGeoJson` 冪等テスト、`DB-2` の index 想定テスト（`buildConditions` が `inArray`/`gte` を生成すること）
- `drizzle/` — `0001_enable_pg_trgm.sql` 相当の custom migration 雛形（`CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE INDEX CONCURRENTLY ...`）を `docs/planning/PHASE2_PLAN.md` §10 に雛形として記載（適用は手動、生成は `drizzle-kit generate --custom` [1](https://dev.to/whoffagents/zero-downtime-postgres-migrations-with-drizzle-orm-22ga)）
- `docs/arch/data-model.md` / `docs/task-list.md` — index 戦略と EXPLAIN 観点を追記

変更しない（境界外）:
- `data/spots.geojson` の 752件データ
- `src/app/api/*` の破壊的変更（契約維持）
- タイル/地図/スクレイパー（Phase 1/3 で扱う）
- `drizzle-kit push` の自動適用（`CONCURRENTLY` はトランザクション外のため手動 [2](https://ecosire.com/blog/drizzle-migrations-zero-downtime)）

## 4. 禁止事項

- 不明点は推測で埋めず、§7 の停止条件に従って質問する
- `docs/arch/adr.md` に反する実装をしない（DB は PostgreSQL 維持、CONCURRENTLY 以外で table lock しない）
- `data/spots.geojson` のマージ挙動を壊さない
- スクレイピングのポライトネスを弱めない（本フェーズでは触らない）

## 5. 完了条件 (DoD)

- [ ] `pnpm run typecheck` / `pnpm run ci` / `pnpm run test` / `pnpm run build` 全 pass
- [ ] `docs/task-list.md` の `API-1` `API-2` `DB-1` `DB-2` が `完了 100%` に更新
- [ ] タスク範囲外のファイルに意図しない変更がない

### API-1 — facets キャッシュと N+1 / COUNT 最適化

- [ ] `_getFacets` が `unstable_cache 3600` 維持 + コメントで `GIN` 前提を明記
- [ ] `phenomena` の `unnest` 集計が `GIN` で高速化される旨を `data-model.md` に記録
- [ ] 手動 `EXPLAIN` で `groupBy` が `index scan` になることを `docs/planning/PHASE2_PLAN.md` §12 に記録（DB 無し環境では `getFacetsFromGeoJson` の in-memory 集計が代替）

### API-2 — 近隣4件の距離計算と除外ロジックのテスト

- [ ] `getNearby` / `getNearbyFromGeoJson` が `spotcd <>` で自身除外 + ユークリッド距離の二乗でソート + `limit 4` を満たすことを `vitest` で証明
- [ ] `filterGeoJson` の `bbox/genre/pref/phenomenon/minRating/q` が既存 7 cases + 追加 2 cases（phenomenon+rating 複合、空クエリ）で pass

### DB-1 — seed の冪等性と advisory lock の検証

- [ ] `ensureSeeded` が `pg_advisory_xact_lock(918273645)` + `count(*)::int` で同時起動でも重複しないことがコードレビューで確認（`tableReady` + `createTableIfMissing` の 3 index が `if not exists`）
- [ ] `importGeoJsonIntoDb` が `onConflictDoUpdate` で冪等、`rowToFeature` が reversible であることを `vitest` で証明

### DB-2 — index（pref/genre/bbox）の EXPLAIN 検証

- [ ] `src/db/schema.ts` に `spots_pref_idx` / `spots_genre_idx` / `spots_bbox_idx` が存在し、`docs/arch/data-model.md` に `pg_trgm` + `GIN (name/kana/address gin_trgm_ops)` + `GIN (phenomena)` の将来 index を雛形として追記
- [ ] `CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE INDEX CONCURRENTLY ... gin_trgm_ops` の SQL 雛形が `drizzle/` or `docs` に存在（適用は手動、事実: `CONCURRENTLY` は transaction 外 [2](https://ecosire.com/blog/drizzle-migrations-zero-downtime)）
- [ ] `EXPLAIN (ANALYZE, BUFFERS)` の観点（`Bitmap Index Scan` vs `Seq Scan`、GIN で 22ms vs 268ms [1](https://imhoratiu.wordpress.com/2026/01/01/postgresql-trigram-similarity-vs-pattern-matching-a-performance-comparison/)）を `PHASE2_PLAN.md` §12 に記録

## 6. テスト方法

| 層 | 実施 | 確認内容 |
|---|---|---|
| Unit (vitest) | `pnpm run test` | `getNearby` の除外・ソート・limit、`filterGeoJson` 複合、`clamp*`/`fearTone`、`rowToFeature` round-trip |
| Component | — | 本フェーズでは対象外 |
| 手動 (DB 有り) | `psql` で `EXPLAIN` | `SELECT ... WHERE prefecture='東京都'` が `Index Scan on spots_pref_idx`、`ilike '%トンネル%'` が `GIN`（将来） |
| 手動 (DB 無し) | `pnpm run dev` | `GET /api/spots?q=トンネル` が 200、`GET /api/spots/1` の `nearby` が 4件で自身を含まない |
| 実環境 | Vercel Preview | `pnpm run build` 7/7、`getFacets` が 1h cache で N+1 なし |

検証コマンド:
```bash
pnpm run typecheck
pnpm run ci
pnpm run test
pnpm run build
# DB 有り時
psql $DATABASE_URL -c "EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM spots WHERE prefecture='東京都' LIMIT 5;"
```

## 7. 停止条件

次の場合は作業を停止し、変更せず報告する:
- 仕様書（本計画書・`docs/arch/*`・`AGENTS.md`・`.agent/skills/*`）同士に矛盾がある
- `docs/task-list.md` の変更範囲を超える変更が必要（例: DB を SQLite に置換）
- 破壊的変更が必要（`spots` の PK 変更・API 契約の破壊）
- `pg_trgm` の `CONCURRENTLY` で `drizzle-kit` の migration が transaction エラーになる（事実: CONCURRENTLY は transaction 外 [2](https://ecosire.com/blog/drizzle-migrations-zero-downtime) のため custom migration で回避）
- 開始時点で作業ツリーに未確認の変更がある

## 8. 完了時に行うこと

1. 差分を自己レビュー（`git diff --stat`）
2. 検証を実行（§6）
3. `docs/task-list.md` を更新
4. タスク ID を含むコミット（例: `feat(API-1): document pg_trgm GIN and add nearby tests`）
5. 証拠中心の完了報告
6. 本計画書 §12 を記入し、`docs/planning/complete/PHASE2_PLAN.md` へ移動（任意）

## 9. サブタスク分割

| ID | テーマ | 主要成果物 | 依存 | 見積 | 監査ID |
|---|---|---|---|---|---|
| API-1 | facets キャッシュと COUNT | `spots-repo.ts` コメント + `data-model.md` 追記 | EM1-B | 0.25日 | API-1 |
| API-2 | 近隣4件テスト | `spots-repo.test.ts` に `getNearby` 3 cases | API-1 | 0.5日 | API-2 |
| DB-1 | seed 冪等テスト | `spots-repo.test.ts` に `rowToFeature` / `ensureSeeded` ロジックのレビュー記録 | DB-2 | 0.25日 | DB-1 |
| DB-2 | index と pg_trgm | `schema.ts` コメント + `drizzle/0002_pg_trgm.sql` 雛形 + `data-model.md` 追記 | — | 0.5日 | DB-2 |

> 合計 1.5日。DB-2 → API-1 → API-2 → DB-1 の順で逐次。

## 10. 設計詳細・仕様

### DB-2 — index と pg_trgm（将来適用の雛形）

現在の `src/db/schema.ts` の 3 index は維持:
```ts
index("spots_pref_idx").on(t.prefecture),
index("spots_genre_idx").on(t.genre),
index("spots_bbox_idx").on(t.lat, t.lng),
```

将来の高速化（752件では seq scan でも十分だが 5k+ で効く）として `docs/arch/data-model.md` に以下を雛形として記録、適用は `CREATE INDEX CONCURRENTLY` で手動（Drizzle は `concurrently()` をサポートするが生成時は要確認 [1](https://dev.to/whoffagents/zero-downtime-postgres-migrations-with-drizzle-orm-22ga)）:
```sql
-- 1. 拡張
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- 2. ilike 高速化（GIN で 22ms vs 268ms [1]）
CREATE INDEX CONCURRENTLY IF NOT EXISTS spots_name_trgm_idx ON spots USING gin (name gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS spots_kana_trgm_idx ON spots USING gin (kana gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS spots_address_trgm_idx ON spots USING gin (address gin_trgm_ops);
-- 3. phenomena 配列の @> / unnest 高速化
CREATE INDEX CONCURRENTLY IF NOT EXISTS spots_phenomena_gin_idx ON spots USING gin (phenomena);
-- 4. 複合（bbox + 絞り込みの選択性が高い場合）
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS spots_bbox_genre_idx ON spots (genre, lat, lng);
```

`createTableIfMissing()` でも `if not exists` で作成するが、本番の既存テーブルには `drizzle-kit generate --custom` で生成した `drizzle/0002_enable_pg_trgm.sql` を手動適用する運用とする。

### API-2 — getNearby の pure helper

`getNearby` / `getNearbyFromGeoJson` の距離は ` (lat-lat0)^2 + (lng-lng0)^2` のユークリッド二乗（haversine ではなく近傍の順序付けでは十分）。pure な `scoreNearby` を抽出してテスト可能にする:
```ts
export function scoreNearby(features: RawFeature[], lat: number, lng: number, excludeSpotcd: number) {
  return features.filter(f=>f.properties.spotcd!==excludeSpotcd)
    .map(f=>({f, d: (f.geometry.coordinates[1]-lat)**2 + (f.geometry.coordinates[0]-lng)**2}))
    .sort((a,b)=>a.d-b.d);
}
```

### API-1 — facets の N+1

`_getFacets` は 4 query（genres/prefectures/phenomena/total）を直列で実行しているが各 `groupBy` は index で高速、かつ `unstable_cache 3600` で 1時間は DB に当たらない。N+1 ではなく 4 query は許容。`phenomena` の `unnest` は将来 `GIN` で改善。

## 11. リスク・Gotchas

| リスク | 影響 | 緩和 |
|---|---|---|
| `CREATE INDEX CONCURRENTLY` を `drizzle-kit` の migration transaction 内で実行 | `cannot run inside a transaction block` エラー | custom migration を transaction 外で手動適用 [2](https://ecosire.com/blog/drizzle-migrations-zero-downtime)、`schema.ts` には `if not exists` のみ残す |
| `pg_trgm` の GIN が 752件では seq scan と変わらない | 効果測定ができない | `EXPLAIN` で `Seq Scan` でも 752件なら <5ms で許容、将来 5k+ で効くことを `data-model.md` に明記 |
| `getNearby` のユークリッド距離が極地で歪む | 距離順が不正確 | 日本国内（緯度 24..46）に限定しているため歪みは <1%、haversine にするなら別 ADR |
| `ensureSeeded` の `pg_advisory_xact_lock` が Vercel の PgBouncer で無効 | 並列 seed で重複 | `onConflictDoUpdate` で冪等のため二重 insert しても PK 競合で上書き、lock は best-effort |

## 12. 実績と証拠（実装後に記入）

| ID | コミット | テスト | 実測値・備考 |
|---|---|---|---|
| API-1 | | `pnpm run test` facets cache 維持 | `unstable_cache 3600` + GIN コメント |
| API-2 | | `pnpm run test` nearby 3 cases pass | 除外・ソート・limit 4 |
| DB-1 | | `pnpm run test` rowToFeature 1 case | advisory lock レビュー |
| DB-2 | | 手動 `EXPLAIN` | `spots_pref_idx` Index Scan / pg_trgm 雛形作成 |
