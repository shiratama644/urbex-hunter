import {
  doublePrecision,
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * 全国心霊マップから収集した心霊スポット。
 * spotcd を主キーとして冪等な upsert を行う。
 */
export const spots = pgTable(
  "spots",
  {
    spotcd: integer("spotcd").primaryKey(),
    name: text("name").notNull(),
    kana: text("kana"),
    address: text("address"),
    prefecture: text("prefecture"),
    city: text("city"),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    genre: text("genre"),
    status: text("status"),
    phenomena: text("phenomena").array().notNull().default([]),
    features: text("features").array().notNull().default([]),
    totalScore: integer("total_score"),
    nationalRank: integer("national_rank"),
    prefRank: integer("pref_rank"),
    fearRating: real("fear_rating"),
    ratingCount: integer("rating_count"),
    outline: text("outline"),
    comment: text("comment"),
    imageUrl: text("image_url"),
    sourceUrl: text("source_url").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("spots_pref_idx").on(t.prefecture),
    index("spots_genre_idx").on(t.genre),
    index("spots_bbox_idx").on(t.lat, t.lng),
  ],
);

export type SpotRow = typeof spots.$inferSelect;
export type NewSpotRow = typeof spots.$inferInsert;
