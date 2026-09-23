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
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Phase 3 拡張 — GeoJSON/SpotProperties 先行、DB 移行は次フェーズで有効化
    // nearestStation: text("nearest_station"), access: text("access"),
    // surroundingFacilities: text("surrounding_facilities").array(),
    // ghostTypes: jsonb("ghost_types"), faq: jsonb("faq"),
    // photoCount: integer("photo_count"), videoCount: integer("video_count"),
    // streetViewCount: integer("street_view_count"), experienceCount: integer("experience_count"), commentCount: integer("comment_count"),
    // spotUpdatedAt: text("spot_updated_at"), // ghostmap 上の更新日 (YYYY-MM-DD)
  },
  (t) => [
    index("spots_pref_idx").on(t.prefecture),
    index("spots_genre_idx").on(t.genre),
    index("spots_bbox_idx").on(t.lat, t.lng),
    // 将来の高速化（5k+ で効く）— pg_trgm + GIN は CONCURRENTLY で手動適用（Phase 2 DB-2）
    // Drizzle は `index(...).concurrently()` をサポートするが、生成 SQL は要確認 [1](https://dev.to/whoffagents/zero-downtime-postgres-migrations-with-drizzle-orm-22ga)
    // 例: CREATE EXTENSION IF NOT EXISTS pg_trgm;
    //     CREATE INDEX CONCURRENTLY spots_name_trgm_idx ON spots USING gin (name gin_trgm_ops);
    //     CREATE INDEX CONCURRENTLY spots_phenomena_gin_idx ON spots USING gin (phenomena);
  ]
);

export type SpotRow = typeof spots.$inferSelect;
export type NewSpotRow = typeof spots.$inferInsert;
