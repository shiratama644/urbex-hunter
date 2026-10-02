/**
 * data/spots.geojson を D1 (SQLite, drizzle-orm) へ取り込む。
 * - ローカル: `file:./dev.db` (libsql) へ 752件を投入 → `wrangler d1 execute --local` でも参照可能
 * - 本番 D1: `wrangler d1 execute urbex-hunter-db --file=./drizzle/0000_*.sql` でマイグレーション後、
 *   `pnpm run seed` で dev.db を作り、`wrangler d1 execute --remote --file` で投入するか、
 *   直接 `importGeoJsonIntoDb` を Workers で呼ぶ（`ensureSeeded` が自動投入）
 *
 * 実行: `pnpm run seed` または `npx tsx scripts/seed.ts`
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@libsql/client";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { spots } from "../src/db/schema";

type RawFeature = {
  geometry: { coordinates: [number, number] };
  properties: Record<string, unknown> & {
    spotcd: number;
    name: string;
    sourceUrl: string;
    phenomena?: string[];
    features?: string[];
  };
};

async function main() {
  const geoPath = path.join(process.cwd(), "data", "spots.geojson");
  let features: RawFeature[];
  try {
    const raw = await readFile(geoPath, "utf8");
    features = (JSON.parse(raw) as { features: RawFeature[] }).features ?? [];
  } catch {
    const mod = (await import("../src/data/spots.json")) as unknown as {
      default: { features: RawFeature[] };
      features?: RawFeature[];
    };
    const data = (mod.default ?? mod) as unknown as { features: RawFeature[] };
    features = data.features ?? [];
  }

  if (features.length === 0) throw new Error("No features found in GeoJSON");

  // ローカル SQLite (dev.db) — D1 と同じ sqlite dialect
  const client = createClient({ url: "file:./dev.db" });
  const db = drizzle(client, { schema: { spots } });

  // テーブル作成（存在しなければ）
  await client.execute(`
    create table if not exists "spots" (
      "spotcd" integer primary key,
      "name" text not null,
      "kana" text,
      "address" text,
      "prefecture" text,
      "city" text,
      "lat" real not null,
      "lng" real not null,
      "genre" text,
      "status" text,
      "phenomena" text not null default '[]',
      "features" text not null default '[]',
      "total_score" integer,
      "national_rank" integer,
      "pref_rank" integer,
      "fear_rating" real,
      "rating_count" integer,
      "outline" text,
      "comment" text,
      "image_url" text,
      "source_url" text not null,
      "updated_at" text not null
    )
  `);
  await client.execute(`create index if not exists "spots_pref_idx" on "spots" ("prefecture")`);
  await client.execute(`create index if not exists "spots_genre_idx" on "spots" ("genre")`);
  await client.execute(`create index if not exists "spots_bbox_idx" on "spots" ("lat","lng")`);

  const toRow = (f: RawFeature) => {
    const p = f.properties as Record<string, unknown> & {
      spotcd: number;
      name: string;
      kana?: string;
      address?: string;
      prefecture?: string;
      city?: string;
      genre?: string;
      status?: string;
      phenomena?: string[];
      features?: string[];
      totalScore?: number;
      nationalRank?: number;
      prefRank?: number;
      fearRating?: number;
      ratingCount?: number;
      outline?: string;
      comment?: string;
      imageUrl?: string;
      sourceUrl: string;
    };
    return {
      spotcd: p.spotcd,
      name: p.name,
      kana: p.kana ?? null,
      address: p.address ?? null,
      prefecture: p.prefecture ?? null,
      city: p.city ?? null,
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
      genre: p.genre ?? null,
      status: p.status ?? null,
      phenomena: JSON.stringify(p.phenomena ?? []),
      features: JSON.stringify(p.features ?? []),
      totalScore: p.totalScore ?? null,
      nationalRank: p.nationalRank ?? null,
      prefRank: p.prefRank ?? null,
      fearRating: p.fearRating ?? null,
      ratingCount: p.ratingCount ?? null,
      outline: p.outline ?? null,
      comment: p.comment ?? null,
      imageUrl: p.imageUrl ?? null,
      sourceUrl: p.sourceUrl,
      updatedAt: new Date().toISOString(),
    };
  };

  const rows = features.map(toRow);
  const chunk = 250;
  for (let i = 0; i < rows.length; i += chunk) {
    await db
      .insert(spots)
      .values(rows.slice(i, i + chunk) as never)
      .onConflictDoUpdate({
        target: spots.spotcd,
        set: {
          name: sql`excluded.name`,
          kana: sql`excluded.kana`,
          address: sql`excluded.address`,
          prefecture: sql`excluded.prefecture`,
          city: sql`excluded.city`,
          lat: sql`excluded.lat`,
          lng: sql`excluded.lng`,
          genre: sql`excluded.genre`,
          status: sql`excluded.status`,
          phenomena: sql`excluded.phenomena`,
          features: sql`excluded.features`,
          totalScore: sql`excluded.total_score`,
          nationalRank: sql`excluded.national_rank`,
          prefRank: sql`excluded.pref_rank`,
          fearRating: sql`excluded.fear_rating`,
          ratingCount: sql`excluded.rating_count`,
          outline: sql`excluded.outline`,
          comment: sql`excluded.comment`,
          imageUrl: sql`excluded.image_url`,
          sourceUrl: sql`excluded.source_url`,
          updatedAt: new Date().toISOString(),
        },
      });
  }
  console.log(`✅ ${rows.length} 件のスポットを dev.db (D1 SQLite) に取り込みました`);
  console.log(
    `   → 本番 D1 へ反映: pnpm exec wrangler d1 execute urbex-hunter-db --remote --file=./drizzle/0000_*.sql`
  );
  console.log(`   → または dev.db を D1 にインポートするバッチを生成してください`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
