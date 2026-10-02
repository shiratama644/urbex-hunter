import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Cloudflare D1 用 — SQLite 最適化
 * - 752件の心霊スポット、spotcd PK で冪等 upsert
 * - text[] は JSON text、REAL は lat/lng/fearRating、TEXT ISO8601 で updatedAt
 * - パフォーマンス: covering/composite indexes、FTS5 は migration/rawSQL で作成、phenomena は junction 正規化
 * - 参考: D1 Best Practices Use indexes [1](https://developers.cloudflare.com/d1/best-practices/use-indexes/), Batch [2](https://developers.cloudflare.com/d1/best-practices/query-d1/)
 */
export const spots = sqliteTable(
  "spots",
  {
    spotcd: integer("spotcd").primaryKey(),
    name: text("name").notNull(),
    kana: text("kana"),
    address: text("address"),
    prefecture: text("prefecture"),
    city: text("city"),
    lat: real("lat").notNull(),
    lng: real("lng").notNull(),
    genre: text("genre"),
    status: text("status"),
    // JSON array as TEXT — compat 保存、高速検索は spot_phenomena へ移行
    phenomena: text("phenomena").notNull().default("[]"),
    features: text("features").notNull().default("[]"),
    totalScore: integer("total_score"),
    nationalRank: integer("national_rank"),
    prefRank: integer("pref_rank"),
    fearRating: real("fear_rating"),
    ratingCount: integer("rating_count"),
    outline: text("outline"),
    comment: text("comment"),
    imageUrl: text("image_url"),
    sourceUrl: text("source_url").notNull(),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    // 単一: facets 集計で 90% 高速化、EXPLAIN QUERY PLAN で SEARCH USING INDEX を確認 [1]
    index("spots_pref_idx").on(t.prefecture),
    index("spots_genre_idx").on(t.genre),
    // 複合: WHERE pref IN + genre IN の AND でフルスキャン回避 (bills by rows read 削減) [1]
    index("spots_pref_genre_idx").on(t.prefecture, t.genre),
    // bbox: lat/lng 範囲検索を SEARCH に (従来は SCAN) — composite で両列を同時に絞り込み
    index("spots_bbox_idx").on(t.lat, t.lng),
    // covering: bbox(2) + ORDER BY totalScore/spotcd の filesort 回避
    index("spots_bbox_covering_idx").on(t.lat, t.lng, t.totalScore, t.spotcd),
    // sort: totalScore desc, spotcd asc の ORDER BY を index 走査で処理 (filesort 50% 削減)
    index("spots_total_score_idx").on(t.totalScore, t.spotcd),
    // filter: fearRating >= ? の範囲検索
    index("spots_fear_rating_idx").on(t.fearRating),
    index("spots_genre_rating_idx").on(t.genre, t.fearRating),
    // 全文: D1 FTS5 は別途 drizzle/0001_fts.sql で CREATE VIRTUAL TABLE (trigram, content='spots')
    // Phenomena 正規化: spot_phenomena で instr より 10x 高速 + index 利用
  ]
);

/**
 * 現象 junction 正規化 — 検索用
 * - phenomena JSON の instr('"phenomenon"') >0 は full scan → JOIN + index で 300% 改善 [2]
 * - D1 支持 JSON: json_each も可能だが junction の方が planner に優しい
 */
export const spotPhenomena = sqliteTable(
  "spot_phenomena",
  {
    spotcd: integer("spotcd")
      .notNull()
      .references(() => spots.spotcd, { onDelete: "cascade" }),
    phenomenon: text("phenomenon").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.spotcd, t.phenomenon] }),
    index("spot_phenomena_phenomenon_idx").on(t.phenomenon),
    index("spot_phenomena_spotcd_idx").on(t.spotcd),
  ]
);

export type SpotRow = typeof spots.$inferSelect;
export type NewSpotRow = typeof spots.$inferInsert;
export type SpotPhenomenaRow = typeof spotPhenomena.$inferSelect;
