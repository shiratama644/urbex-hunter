import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Cloudflare D1 用 — SQLite
 * 全国心霊マップから収集した心霊スポット。spotcd を主キーとして冪等な upsert を行う。
 * Postgres からの移行: text[] は JSON text、doublePrecision は real、timestamp は text (ISO8601)
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
    // JSON array as TEXT — e.g. '["a","b"]'
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
    index("spots_pref_idx").on(t.prefecture),
    index("spots_genre_idx").on(t.genre),
    index("spots_bbox_idx").on(t.lat, t.lng),
  ]
);

export type SpotRow = typeof spots.$inferSelect;
export type NewSpotRow = typeof spots.$inferInsert;
