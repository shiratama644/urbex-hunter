# Data Model — DB スキーマ・GeoJSON・投入フロー

## spots テーブル（正本: `src/db/schema.ts`）

```ts
export const spots = pgTable("spots", {
  spotcd: integer("spotcd").primaryKey(),        // 主キー。冪等な upsert に使う
  name: text("name").notNull(),
  kana: text("kana"),
  address: text("address"),
  prefecture: text("prefecture"),
  city: text("city"),
  lat: doublePrecision("lat").notNull(),         // 緯度
  lng: doublePrecision("lng").notNull(),         // 経度
  genre: text("genre"),                          // ジャンル（トンネル等）
  status: text("status"),                        // 状態
  phenomena: text("phenomena").array().notNull().default([]), // 心霊現象（複数）
  features: text("features").array().notNull().default([]),   // 特徴タグ（複数）
  totalScore: integer("total_score"),
  nationalRank: integer("national_rank"),
  prefRank: integer("pref_rank"),
  fearRating: real("fear_rating"),               // 5段階
  ratingCount: integer("rating_count"),
  outline: text("outline"),
  comment: text("comment"),
  imageUrl: text("image_url"),
  sourceUrl: text("source_url").notNull(),       // 元記事URL
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("spots_pref_idx").on(t.prefecture),
  index("spots_genre_idx").on(t.genre),
  index("spots_bbox_idx").on(t.lat, t.lng),
])
```

- `spotcd` の重複は **upsert**（最新で上書き）。`drizzle-orm` の `onConflictDoUpdate` を使う。
- `phenomena` / `features` は `text[]`。空配列 default。
- index は `prefecture` / `genre` / `(lat,lng)`。EM1-B で `readGeoJson` は `stat.mtimeMs+size` メモ化、`getFacets` は `unstable_cache` 1h で 4クエリを削減。将来は `pg_trgm`（`gin_trgm_ops`）や `phenomena` の GIN を ADR で検討。

## GeoJSON（補助的ソース・オブ・トゥルース: `data/spots.geojson`）

```json
{
  "type": "FeatureCollection",
  "count": 752,
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [lng, lat] },
      "properties": {
        "spotcd": 123,
        "name": "旧トンネル",
        "kana": "きゅうとんねる",
        "address": "…",
        "prefecture": "東京都",
        "city": "…",
        "genre": "トンネル",
        "status": "…",
        "phenomena": ["足音", "気配"],
        "features": ["廃墟", "トンネル"],
        "totalScore": 85,
        "nationalRank": 42,
        "prefRank": 3,
        "fearRating": 3.8,
        "ratingCount": 120,
        "outline": "…",
        "comment": "…",
        "imageUrl": "https://…",
        "sourceUrl": "https://ghostmap.jp/spot/123"
      }
    }
  ]
}
```

- 座標は `[lng, lat]`（GeoJSON 標準）。DB は `lat` / `lng` に分解して保持する。
- ファイルサイズは約 932KB。Git 追跡するが、差分は週次 scrape でまとめて更新する。

## 型（正本: `src/lib/types.ts`）

```ts
export type SpotProperties = {
  spotcd: number; name: string; kana: string | null; address: string | null;
  prefecture: string | null; city: string | null;
  genre: string | null; status: string | null;
  phenomena: string[]; features: string[];
  totalScore: number | null; nationalRank: number | null; prefRank: number | null;
  fearRating: number | null; ratingCount: number | null;
  outline: string | null; comment: string | null;
  imageUrl: string | null; sourceUrl: string;
}
export type SpotFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] }; // [lng, lat]
  properties: SpotProperties;
}
export type SpotCollection = {
  type: "FeatureCollection"; count: number; truncated?: boolean; features: SpotFeature[];
}
export type SpotFacets = {
  total: number;
  genres: { value: string; count: number }[];
  prefectures: { value: string; count: number }[];
  phenomena: { value: string; count: number }[];
}
```

`GENRE_EMOJI` / `genreEmoji()` / `fearTone()` も同ファイルが正本。

## 投入フロー

```
[scrape.ts] --cheerio--> data/spots.geojson (FeatureCollection / 752件 / merge)
      ↓
[drizzle-kit push]  --Drizzle-->  PostgreSQL (CREATE TABLE / INDEX)
      ↓
[seed.ts] --read GeoJSON--> upsert into spots (spotcd PK / advisory lock)
      ↓
[ensureSeeded()] --tableReady?--> if empty, auto-seed from GeoJSON (API 初回アクセス時)
```

- **scrape**: `PREFS` / `LIMIT_PER_PREF` / `CONCURRENCY` で制御。既存 GeoJSON とマージし、`spotcd` 重複は最新で上書き。
- **seed**: `data/spots.geojson` を `readFile` → `JSON.parse` → `toRow()` → `insert ... onConflictDoUpdate`。`DATABASE_URL` が必要。
- **ensureSeeded**: `src/lib/spots-repo.ts` の `seedPromise`（単一実行）で多重実行を防ぐ。`pg_try_advisory_lock` で並列プロセス間の競合も防ぐ。
- **tableReady / createTableIfMissing**: DB が無い / テーブルが無い環境でも `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` で復旧する。競合エラー（`42P07` / `42P16`）は握り潰して続行する。

## 設定

`drizzle.config.ts`（EM1-A で `drizzle.config.json` から移行）:
```ts
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/app_db" },
});
```

本番では `DATABASE_URL` 環境変数が `db/index.ts` と `drizzle.config.ts` で優先される。`drizzle-kit push` の接続先も同様に `DATABASE_URL` を使う。

## GeoJSON の必須フィールド（EM1-C）

`data/spots.geojson` は `count`（features.length）と `generatedAt`（ISO8601）と `source`（BASE）を必ず含む。監査で `count` が欠落していたため EM1-C で修正。
