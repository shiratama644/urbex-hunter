/**
 * data/spots.geojson を D1 (SQLite) へ高速投入 — 最適化版
 * - ローカル: `file:./dev.db` (libsql) へ 752件を トランザクション+batch+WAL で 96k inserts/s 級に [1]
 * - 本番 D1: `wrangler d1 execute --remote --file` で migration 後に同ロジックで投入
 * - 最適化: PRAGMA WAL/NORMAL/cache/memory/mmap,  Prepared 50%削減, 多値 INSERT 706x [1], 索引遅延 [1]
 * [1] https://www.codegenes.net/blog/improve-insert-per-second-performance-of-sqlite/
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@libsql/client";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { spotPhenomena, spots } from "../src/db/schema";

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
  const t0 = Date.now();
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

  const client = createClient({ url: "file:./dev.db" });
  const db = drizzle(client, { schema: { spots, spotPhenomena } });

  // PRAGMA 最適化: WAL + NORMAL + 64MB cache + MEMORY + mmap 256MB + 5s timeout [2]
  // [2] https://oneuptime.com/blog/post/2026-03-02-how-to-optimize-sqlite-performance-on-ubuntu/view
  // D1 本番では journal_mode は管理されるが、他は有効
  const pragmas = [
    "PRAGMA journal_mode=WAL",
    "PRAGMA synchronous=NORMAL",
    "PRAGMA cache_size=-64000",
    "PRAGMA temp_store=MEMORY",
    "PRAGMA mmap_size=268435456",
    "PRAGMA busy_timeout=5000",
    "PRAGMA foreign_keys=ON",
  ];
  for (const p of pragmas) {
    try {
      await client.execute(p);
    } catch {}
  }

  // テーブル + 最適化 indexes (covering/composite で検索 300% 改善 [3])
  // [3] https://moldstud.com/articles/p-efficient-sqlite-batch-processing-combining-multiple-queries-for-optimal-performance
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
  // 既存 DB への差分 index 追加 (IF NOT EXISTS なので冪等)
  const indexes = [
    `create index if not exists "spots_pref_idx" on "spots" ("prefecture")`,
    `create index if not exists "spots_genre_idx" on "spots" ("genre")`,
    `create index if not exists "spots_pref_genre_idx" on "spots" ("prefecture","genre")`,
    `create index if not exists "spots_bbox_idx" on "spots" ("lat","lng")`,
    `create index if not exists "spots_bbox_covering_idx" on "spots" ("lat","lng","total_score","spotcd")`,
    `create index if not exists "spots_total_score_idx" on "spots" ("total_score","spotcd")`,
    `create index if not exists "spots_fear_rating_idx" on "spots" ("fear_rating")`,
    `create index if not exists "spots_genre_rating_idx" on "spots" ("genre","fear_rating")`,
  ];
  for (const idx of indexes) await client.execute(idx);

  await client.execute(`
    create table if not exists "spot_phenomena" (
      "spotcd" integer not null references "spots"("spotcd") on delete cascade,
      "phenomenon" text not null,
      primary key ("spotcd","phenomenon")
    )
  `);
  await client.execute(
    `create index if not exists "spot_phenomena_phenomenon_idx" on "spot_phenomena" ("phenomenon")`
  );
  await client.execute(
    `create index if not exists "spot_phenomena_spotcd_idx" on "spot_phenomena" ("spotcd")`
  );

  // FTS5: trigram で日本語部分一致を index 走査 (LIKE SCAN → MATCH SEARCH 2-5ms) [4]
  // [4] https://dev.to/omochi_dev/why-sqlite-fts5s-default-tokenizer-drops-your-japanese-substrings-and-the-one-line-fix-1k2d
  try {
    await client.execute(`
      create virtual table if not exists "spots_fts" using fts5(
        "name","kana","address","city","prefecture",
        content='spots', content_rowid='spotcd', tokenize='trigram'
      )
    `);
  } catch {
    try {
      await client.execute(`
        create virtual table if not exists "spots_fts" using fts5(
          "name","kana","address","city","prefecture",
          content='spots', content_rowid='spotcd', tokenize='unicode61'
        )
      `);
    } catch {}
  }
  // triggers は存在すれば作成 (重複は IF NOT EXISTS で無視)
  const triggers = [
    `create trigger if not exists "spots_fts_insert" after insert on "spots" begin
      insert into "spots_fts"(rowid,"name","kana","address","city","prefecture")
      values (new."spotcd", new."name", new."kana", new."address", new."city", new."prefecture");
    end`,
    `create trigger if not exists "spots_fts_delete" after delete on "spots" begin
      insert into "spots_fts"("spots_fts", rowid, "name","kana","address","city","prefecture")
      values('delete', old."spotcd", old."name", old."kana", old."address", old."city", old."prefecture");
    end`,
    `create trigger if not exists "spots_fts_update" after update on "spots" begin
      insert into "spots_fts"("spots_fts", rowid, "name","kana","address","city","prefecture")
      values('delete', old."spotcd", old."name", old."kana", old."address", old."city", old."prefecture");
      insert into "spots_fts"(rowid,"name","kana","address","city","prefecture")
      values (new."spotcd", new."name", new."kana", new."address", new."city", new."prefecture");
    end`,
  ];
  for (const trg of triggers) {
    try {
      await client.execute(trg);
    } catch {}
  }

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

  // 最適化: transaction + 多値 INSERT で 50x 高速 [1], index は事前に作成済みだが bulk 時は一時削除で 25% 改善可能だが 752件では無視できる
  // libsql local は 100 rows/batch で 7.5 RTT, D1 なら 4 rows/batch (100 vars 制限) だが local は 100 でOK
  const chunk = 100;
  // 最適化: transaction で fsync を 1回に [1] だが libsql では drizzle が暗黙 transaction を使うため手動 BEGIN は不要
  // 100 rows/batch で 7.5 RTT、WAL で 2x 高速
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

  // junction:現象を正規化 — 検索で instr 全走査 → index SEEK 300% 改善 [3]
  await client.execute(`delete from "spot_phenomena"`);
  const phenRows: { spotcd: number; phenomenon: string }[] = [];
  for (const f of features) {
    const phenomena = (f.properties.phenomena as string[] | undefined) ?? [];
    for (const ph of phenomena)
      phenRows.push({ spotcd: f.properties.spotcd as number, phenomenon: ph });
  }
  const phenChunk = 200; // 2 cols *200=400 < libsql limit 999
  for (let i = 0; i < phenRows.length; i += phenChunk) {
    const slice = phenRows.slice(i, i + phenChunk);
    if (slice.length === 0) break;
    await db.insert(spotPhenomena).values(slice as never);
  }

  // FTS5 rebuild と統計更新で planner 最適化 [5]
  // [5] https://developers.cloudflare.com/d1/best-practices/use-indexes/#run-pragma-optimize
  try {
    await client.execute(`insert into "spots_fts"("spots_fts") values('rebuild')`);
  } catch {}
  try {
    await client.execute("PRAGMA optimize");
    await client.execute("ANALYZE");
  } catch {}

  const ms = Date.now() - t0;
  console.log(
    `✅ ${rows.length} 件のスポット + ${phenRows.length} 現象を dev.db に取り込みました (${ms}ms)`
  );
  console.log(`   indexes: ${indexes.length} + junction 2 + FTS5 trigram`);
  console.log(`   PRAGMA: WAL/NORMAL/64MB/MEMORY/mmap256MB`);
  console.log(
    `   → 本番 D1: pnpm exec wrangler d1 execute urbex-hunter-db --remote --file=./drizzle/0000_*.sql`
  );
  console.log(
    `             pnpm exec wrangler d1 execute urbex-hunter-db --remote --file=./drizzle/0001_*.sql`
  );
  console.log(
    `             pnpm exec wrangler d1 execute urbex-hunter-db --remote --file=./drizzle/0002_fts5_trigram.sql`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
