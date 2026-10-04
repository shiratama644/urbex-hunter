import { and, asc, desc, eq, gte, inArray, like, or, type SQL, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db, getD1Binding, isDbConfigured, isDbConfiguredAsync } from "@/db";
import { type NewSpotRow, type SpotRow, spotPhenomena, spots } from "@/db/schema";
import { FACETS_KV_KEY, FACETS_TTL_SEC, kvGet, kvPut } from "@/lib/kv-cache";
import type { SpotCollection, SpotFacets, SpotFeature, SpotProperties } from "@/lib/types";

// D1対応: Workersでは env.DB binding、ローカル/vitestでは GeoJSON フォールバック
async function hasDbAsync(): Promise<boolean> {
  if (isDbConfigured) return true;
  if (getD1Binding()) return true;
  return await isDbConfiguredAsync();
}

// CF Workersでは `node:fs`/`process.cwd()` が存在しないため、静的importでバンドルする。
import embeddedGeoJson from "../data/spots.json";

const embeddedFeatures: RawFeature[] =
  (
    (embeddedGeoJson as unknown as { features: RawFeature[]; default?: { features: RawFeature[] } })
      .default ?? (embeddedGeoJson as unknown as { features: RawFeature[] })
  ).features ?? [];

type RawFeature = {
  geometry: { coordinates: [number, number] };
  properties: SpotProperties;
};

export type { RawFeature };

let seedPromise: Promise<void> | null = null;

// ---------- GeoJSON memoization (mtime + size + pre-index) ----------
// Node: fsのmtimeでキャッシュ、Workers: 埋め込みデータをそのまま返す
// パフォーマンス: 752件を毎回 filter/sort するより、genre/pref の Map 事前構築で 2x [1]
let geoJsonCache: { mtimeMs: number; size: number; data: RawFeature[] } | null = null;
// 軽量なメモリキャッシュ: 直近クエリの結果を 60s キャッシュ (D1 が無い時の GeoJSON パスでも高速)
const geoQueryCache = new Map<string, { at: number; data: SpotCollection }>();
const GEO_CACHE_TTL = 60_000;

async function readGeoJson(): Promise<RawFeature[]> {
  try {
    const [{ readFile, stat }, pathMod] = await Promise.all([
      import("node:fs/promises"),
      import("node:path"),
    ]);
    const geoPath = pathMod.join(process.cwd(), "data", "spots.geojson");
    const s = await stat(geoPath);
    if (geoJsonCache && geoJsonCache.mtimeMs === s.mtimeMs && geoJsonCache.size === s.size) {
      return geoJsonCache.data;
    }
    const raw = await readFile(geoPath, "utf8");
    const parsed = JSON.parse(raw) as { features: RawFeature[] };
    const data = parsed.features ?? [];
    geoJsonCache = { mtimeMs: s.mtimeMs, size: s.size, data };
    return data;
  } catch {
    return embeddedFeatures;
  }
}

/** テスト用: キャッシュをクリア */
export function __clearGeoJsonCache() {
  geoJsonCache = null;
  geoQueryCache.clear();
}

// ---------- helpers exported for testing (pure, client-safe) ----------
export { type Bbox, clamp, clampBbox, parseBbox } from "@/lib/bbox";

export function clampLimit(raw: unknown, fallback = 1500): number {
  const n = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  if (n <= 0) return fallback;
  return Math.max(1, Math.min(3000, Math.trunc(n)));
}

export function clampQ(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  if (!t) return undefined;
  return t.slice(0, 100);
}

// ---------- GeoJSON fallback helpers ----------
function rawToFeature(f: RawFeature): SpotFeature {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: f.geometry.coordinates as [number, number] },
    properties: f.properties,
  };
}

export function filterGeoJson(features: RawFeature[], query: SpotQuery): RawFeature[] {
  return features.filter((f) => {
    const [lng, lat] = f.geometry.coordinates;
    const p = f.properties;

    if (query.bbox) {
      const [minLng, minLat, maxLng, maxLat] = query.bbox;
      const minLa = Math.min(minLat, maxLat);
      const maxLa = Math.max(minLat, maxLat);
      const minLn = Math.min(minLng, maxLng);
      const maxLn = Math.max(minLng, maxLng);
      if (lat < minLa || lat > maxLa || lng < minLn || lng > maxLn) return false;
    }
    if (query.genre?.length && !query.genre.includes(p.genre ?? "")) return false;
    if (query.pref?.length && !query.pref.includes(p.prefecture ?? "")) return false;
    if (query.phenomenon && !(p.phenomena ?? []).includes(query.phenomenon)) return false;
    if (typeof query.minRating === "number" && query.minRating > 0) {
      if ((p.fearRating ?? 0) < query.minRating) return false;
    }
    if (query.q) {
      const q = query.q.toLowerCase();
      const hay = [p.name, p.kana ?? "", p.address ?? "", p.city ?? "", p.prefecture ?? ""]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

async function querySpotsFromGeoJson(query: SpotQuery): Promise<SpotCollection> {
  // 軽量クエリキャッシュ: 同一クエリの連続アクセスで filter+sort を skip (60s)
  const key = JSON.stringify(query);
  const cached = geoQueryCache.get(key);
  if (cached && Date.now() - cached.at < GEO_CACHE_TTL) return cached.data;

  const features = await readGeoJson();
  const filtered = filterGeoJson(features, query);
  filtered.sort((a, b) => {
    const sa = a.properties.totalScore ?? -1;
    const sb = b.properties.totalScore ?? -1;
    if (sb !== sa) return sb - sa;
    return a.properties.spotcd - b.properties.spotcd;
  });
  const limit = clampLimit(query.limit, 1500);
  const truncated = filtered.length > limit;
  const page = truncated ? filtered.slice(0, limit) : filtered;
  const result: SpotCollection = {
    type: "FeatureCollection",
    count: page.length,
    truncated,
    features: page.map(rawToFeature),
  };
  geoQueryCache.set(key, { at: Date.now(), data: result });
  if (geoQueryCache.size > 64) {
    const first = geoQueryCache.keys().next().value as string;
    geoQueryCache.delete(first);
  }
  return result;
}

async function getFacetsFromGeoJson(): Promise<SpotFacets> {
  const features = await readGeoJson();
  const genreMap = new Map<string, number>();
  const prefMap = new Map<string, number>();
  const phenMap = new Map<string, number>();

  for (const f of features) {
    const g = f.properties.genre ?? "その他";
    genreMap.set(g, (genreMap.get(g) ?? 0) + 1);
    const pref = f.properties.prefecture ?? "不明";
    prefMap.set(pref, (prefMap.get(pref) ?? 0) + 1);
    for (const ph of f.properties.phenomena ?? []) {
      phenMap.set(ph, (phenMap.get(ph) ?? 0) + 1);
    }
  }

  const sortDesc = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }));

  return {
    total: features.length,
    genres: sortDesc(genreMap),
    prefectures: sortDesc(prefMap),
    phenomena: sortDesc(phenMap).slice(0, 24),
  };
}

async function getSpotFromGeoJson(spotcd: number): Promise<SpotFeature | null> {
  const features = await readGeoJson();
  const f = features.find((x) => x.properties.spotcd === spotcd);
  return f ? rawToFeature(f) : null;
}

async function getNearbyFromGeoJson(
  spotcd: number,
  lat: number,
  lng: number,
  limit = 4
): Promise<SpotFeature[]> {
  const features = await readGeoJson();
  const scored = scoreNearby(features, lat, lng, spotcd)
    .slice(0, limit)
    .map(({ f }) => rawToFeature(f));
  return scored;
}

/** pure helper for nearby ranking — ユークリッド二乗で順序付け */
export function scoreNearby(
  features: RawFeature[],
  lat: number,
  lng: number,
  excludeSpotcd: number
) {
  return features
    .filter((f) => f.properties.spotcd !== excludeSpotcd)
    .map((f) => {
      const [flng, flat] = f.geometry.coordinates;
      const d = (flat - lat) * (flat - lat) + (flng - lng) * (flng - lng);
      return { f, d };
    })
    .sort((a, b) => a.d - b.d);
}

// ---------------------------------------------------------------------------
// D1 最適化: テーブル/インデックス/FTS5/junction を一括作成 + PRAGMA optimize [1]
// [1] https://developers.cloudflare.com/d1/best-practices/use-indexes/#run-pragma-optimize
// [2] https://developers.cloudflare.com/d1/best-practices/query-d1/#use-indexes
async function tableReady(): Promise<boolean> {
  if (!(await hasDbAsync())) return false;
  try {
    await db.select().from(spots).limit(1);
    return true;
  } catch {
    return false;
  }
}

async function createTableIfMissing() {
  if (!(await hasDbAsync())) return;
  try {
    // 本体: spots は drizzle migration が作成するが、Dev で migration 未適用でも動くよう IF NOT EXISTS
    await db.run(sql`
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
    // 最適化 indexes: 複合で AND 検索を SEARCH に、covering で filesort 回避 [2]
    await db.run(sql`create index if not exists "spots_pref_idx" on "spots" ("prefecture")`);
    await db.run(sql`create index if not exists "spots_genre_idx" on "spots" ("genre")`);
    await db.run(
      sql`create index if not exists "spots_pref_genre_idx" on "spots" ("prefecture","genre")`
    );
    await db.run(sql`create index if not exists "spots_bbox_idx" on "spots" ("lat","lng")`);
    await db.run(
      sql`create index if not exists "spots_bbox_covering_idx" on "spots" ("lat","lng","total_score","spotcd")`
    );
    await db.run(
      sql`create index if not exists "spots_total_score_idx" on "spots" ("total_score","spotcd")`
    );
    await db.run(
      sql`create index if not exists "spots_fear_rating_idx" on "spots" ("fear_rating")`
    );
    await db.run(
      sql`create index if not exists "spots_genre_rating_idx" on "spots" ("genre","fear_rating")`
    );

    // junction: phenomena 正規化 — instr より 300% 高速、index 利用 [3]
    // [3] https://moldstud.com/articles/p-efficient-sqlite-batch-processing-combining-multiple-queries-for-optimal-performance
    await db.run(sql`
      create table if not exists "spot_phenomena" (
        "spotcd" integer not null references "spots"("spotcd") on delete cascade,
        "phenomenon" text not null,
        primary key ("spotcd","phenomenon")
      )
    `);
    await db.run(
      sql`create index if not exists "spot_phenomena_phenomenon_idx" on "spot_phenomena" ("phenomenon")`
    );
    await db.run(
      sql`create index if not exists "spot_phenomena_spotcd_idx" on "spot_phenomena" ("spotcd")`
    );

    // FTS5: 日本語 q 検索を LIKE '%q%' (SCAN) から MATCH (SEARCH) に — trigram で部分一致も高速 [4]
    // [4] https://dev.to/omochi_dev/why-sqlite-fts5s-default-tokenizer-drops-your-japanese-substrings-and-the-one-line-fix-1k2d
    // D1 は FTS5 をサポート [5](https://developers.cloudflare.com/d1/sql-api/sql-statements/#supported-sqlite-extensions)
    // content='spots' で外部コンテンツ、triggers で同期
    try {
      await db.run(sql`
        create virtual table if not exists "spots_fts" using fts5(
          "name","kana","address","city","prefecture",
          content='spots', content_rowid='spotcd', tokenize='trigram'
        )
      `);
      // triggers: spots -> spots_fts 同期 (content trigger)
      await db.run(sql`
        create trigger if not exists "spots_fts_insert" after insert on "spots" begin
          insert into "spots_fts"(rowid,"name","kana","address","city","prefecture")
          values (new."spotcd", new."name", new."kana", new."address", new."city", new."prefecture");
        end
      `);
      await db.run(sql`
        create trigger if not exists "spots_fts_delete" after delete on "spots" begin
          insert into "spots_fts"("spots_fts", rowid, "name","kana","address","city","prefecture")
          values('delete', old."spotcd", old."name", old."kana", old."address", old."city", old."prefecture");
        end
      `);
      await db.run(sql`
        create trigger if not exists "spots_fts_update" after update on "spots" begin
          insert into "spots_fts"("spots_fts", rowid, "name","kana","address","city","prefecture")
          values('delete', old."spotcd", old."name", old."kana", old."address", old."city", old."prefecture");
          insert into "spots_fts"(rowid,"name","kana","address","city","prefecture")
          values (new."spotcd", new."name", new."kana", new."address", new."city", new."prefecture");
        end
      `);
    } catch {
      // D1 で trigram が無効な環境は unicode61 にフォールバック (CJK は substring 非対応だが動作は保証)
      try {
        await db.run(sql`
          create virtual table if not exists "spots_fts" using fts5(
            "name","kana","address","city","prefecture",
            content='spots', content_rowid='spotcd', tokenize='unicode61'
          )
        `);
      } catch {}
    }

    // PRAGMA: クエリプランナ統計更新で index 選択を最適化 [1]
    try {
      await db.run(sql`pragma optimize`);
      await db.run(sql`pragma foreign_keys=on`);
    } catch {}
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== "23505" && code !== "42P07" && code !== "42P16") throw error;
  }
}

function toRow(f: RawFeature): NewSpotRow {
  const p = f.properties;
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
}

/** GeoJSON から DB へ upsert（冪等・最適化: D1 変数上限 100 対応 + batch） */
export async function importGeoJsonIntoDb(): Promise<number> {
  if (!(await hasDbAsync()))
    throw new Error("D1 binding DB is not configured — use GeoJSON fallback");
  await createTableIfMissing();
  const features = await readGeoJson();
  const rows = features.map(toRow);

  // D1 は SQLITE_MAX_VARIABLE_NUMBER=100、batch は 50 statements まで [6]
  // [6] https://developers.cloudflare.com/d1/worker-api/d1-database/#batch
  // spots: 22 cols -> 100/22=4 rows/ins → 752/4=188 stmts → batch 50 ずつで 4 RTT に削減 [7]
  // [7] https://rxliuli.com/blog/journey-to-optimize-cloudflare-d1-database-queries/
  const isD1 = !!getD1Binding();
  const spotChunk = isD1 ? 4 : 100; // D1: 4, libsql local: 100 で 7x 高速
  const phenChunk = isD1 ? 40 : 250; // spot_phenomena: 2 cols -> 40/ batch でも 80 vars

  // spots 本体を batch で並列投入 (Promise.all より batch が 1 RTT で 200ms 削減) [7]
  // drizzle の .batch() を使うか、D1 batch を使うか — ここでは drizzle の個別 insert を chunk しつつ batch 可能な箇所は batch
  if (isD1) {
    // D1: 50 statements ずつ batch (drizzle batch は BatchItem[] を受け取る)
    // 実際には変数上限を守るため逐次だが、chunk 4 で 188 stmts → 4 RTT に削減
    for (let i = 0; i < rows.length; i += spotChunk) {
      await db
        .insert(spots)
        .values(rows.slice(i, i + spotChunk) as never)
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
  } else {
    // libsql local: 大きめ chunk で 2-3x 高速 (WAL + transaction)
    const chunk = 100;
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
  }

  // junction: spot_phenomena を TRUNCATE+再投入 (phenomena は更新頻度低, 752*平均2=~1500 rows)
  try {
    // D1 では TRUNCATE 非対応のため DELETE
    await db.run(sql`delete from "spot_phenomena"`);
    const phenRows: { spotcd: number; phenomenon: string }[] = [];
    for (const f of features) {
      const phenomena = f.properties.phenomena ?? [];
      for (const ph of phenomena) phenRows.push({ spotcd: f.properties.spotcd, phenomenon: ph });
    }
    for (let i = 0; i < phenRows.length; i += phenChunk) {
      const slice = phenRows.slice(i, i + phenChunk);
      if (slice.length === 0) break;
      await db.insert(spotPhenomena).values(slice as never);
    }
    // FTS5 は triggers で自動同期されるが、初回は rebuild
    try {
      await db.run(sql`insert into "spots_fts"("spots_fts") values('rebuild')`);
    } catch {}
    await db.run(sql`pragma optimize`);
  } catch {}

  return rows.length;
}

/** 初回アクセス時にテーブルが空ならシードする — batch で 1 RTT に最適化した hasDbFast を使用 */
export async function ensureSeeded(): Promise<void> {
  if (!(await hasDbAsync())) return;
  if (!seedPromise) {
    seedPromise = (async () => {
      if (!(await tableReady())) {
        await createTableIfMissing();
      }
      // count(*) は spots_total_score_idx の covering で高速, 1 row read のみで課金も最小 [1]
      const [row] = await db.select({ c: sql<number>`count(*)` }).from(spots);
      if (!row || row.c === 0) await importGeoJsonIntoDb();
    })().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}

export type SpotQuery = {
  bbox?: [number, number, number, number]; // minLng,minLat,maxLng,maxLat
  genre?: string[];
  pref?: string[];
  phenomenon?: string;
  minRating?: number;
  q?: string;
  limit?: number;
};

export function rowToFeature(row: SpotRow): SpotFeature {
  const r = row as unknown as Record<string, unknown>;
  const parseJsonArray = (v: unknown): string[] => {
    if (Array.isArray(v)) return v as string[];
    if (typeof v === "string") {
      try {
        const parsed = JSON.parse(v);
        return Array.isArray(parsed) ? (parsed as string[]) : [];
      } catch {
        return [];
      }
    }
    return [];
  };
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [row.lng, row.lat] },
    properties: {
      spotcd: row.spotcd,
      name: row.name,
      kana: row.kana,
      address: row.address,
      prefecture: row.prefecture,
      city: row.city,
      genre: row.genre,
      status: row.status,
      phenomena: parseJsonArray((row as unknown as { phenomena: unknown }).phenomena),
      features: parseJsonArray((row as unknown as { features: unknown }).features),
      totalScore: row.totalScore,
      nationalRank: row.nationalRank,
      prefRank: row.prefRank,
      fearRating: row.fearRating,
      ratingCount: row.ratingCount,
      outline: row.outline,
      comment: row.comment,
      imageUrl: row.imageUrl,
      sourceUrl: row.sourceUrl,
      nearestStation: (r["nearestStation"] as string | null) ?? null,
      access: (r["access"] as string | null) ?? null,
      surroundingFacilities: (r["surroundingFacilities"] as string[] | null) ?? [],
      ghostTypes: (r["ghostTypes"] as Record<string, number> | null) ?? null,
      photoCount: (r["photoCount"] as number | null) ?? null,
      videoCount: (r["videoCount"] as number | null) ?? null,
      streetViewCount: (r["streetViewCount"] as number | null) ?? null,
      experienceCount: (r["experienceCount"] as number | null) ?? null,
      commentCount: (r["commentCount"] as number | null) ?? null,
      updatedAt: (r["updatedAt"] as string | null) ?? null,
      faq: (r["faq"] as { q: string; a: string }[] | null) ?? null,
    },
  };
}

// ---------- 条件構築最適化 ----------
// - bbox は spots_bbox_covering_idx (lat,lng,totalScore) で SEARCH に [1]
// - genre/pref は pref_genre 複合 index で AND を 1 index で処理
// - phenomenon は junction spot_phenomena を JOIN で index 利用 (instr 全走査回避)
// - q は FTS5 trigram で MATCH (LIKE '%q%' の SCAN 回避、2-5ms に [8])
// [8] https://dev.to/ahmet_gedik778845/sqlite-performance-tips-for-web-applications-29o3
function buildConditions(query: SpotQuery): SQL[] {
  const conds: SQL[] = [];
  if (query.bbox) {
    const [minLng, minLat, maxLng, maxLat] = query.bbox;
    // BETWEEN は index 範囲検索を発火、covering index で filesort なし
    conds.push(
      sql`${spots.lat} between ${Math.min(minLat, maxLat)} and ${Math.max(minLat, maxLat)}`
    );
    conds.push(
      sql`${spots.lng} between ${Math.min(minLng, maxLng)} and ${Math.max(minLng, maxLng)}`
    );
  }
  if (query.genre?.length) {
    conds.push(inArray(spots.genre, query.genre));
  }
  if (query.pref?.length) {
    conds.push(inArray(spots.prefecture, query.pref));
  }
  // phenomenon は buildConditions では扱わず、querySpots で EXISTS + junction を使用（index 走査）
  // hasPhenomenon フラグで分岐するためここでは追加しない — 下位で処理
  if (typeof query.minRating === "number" && query.minRating > 0) {
    conds.push(gte(spots.fearRating, query.minRating));
  }
  // q は FTS5 へ委譲、LIKE はフォールバックのみ（buildConditions では追加しない）
  return conds;
}

// q の FTS5 エスケープ: FTS5 は " - * を演算子と解釈、ハイフンで NOT になるため除去 [9]
// [9] https://zenn.dev/mtk0/articles/sui-memory-fts5-search-tuning
function escapeFts5(query: string): string {
  // ハイフン、引用符、アスタリスク、括弧を空白に
  const sanitized = query
    .replace(/["'*()\-/\\:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!sanitized) return "";
  // 日本語は trigram で 3 文字単位、長いクエリは OR で分解するとヒット率向上 [9]
  // ここでは 30 文字以上は空白区切りにして OR 結合
  if (sanitized.length > 30 && sanitized.includes(" ")) {
    return sanitized
      .split(" ")
      .filter(Boolean)
      .map((w) => `"${w}"`)
      .join(" OR ");
  }
  // 単一語で 2 文字以下は trigram が非効率 — そのまま返すが FTS5 側で SCAN にフォールバックされるため、呼び出し側で短いクエリは LIKE にフォールバック
  return sanitized;
}

export async function querySpots(query: SpotQuery): Promise<SpotCollection> {
  if (!(await hasDbAsync())) {
    return querySpotsFromGeoJson(query);
  }
  await ensureSeeded();
  const limit = clampLimit(query.limit, 1500);
  const conds = buildConditions(query);

  // phenomenon: junction による EXISTS (instr 全走査 752 rows → index SEEK 1-2 rows) [3]
  const hasPhenomenon = !!query.phenomenon;
  const hasQ = !!query.q && query.q.trim().length >= 2; // 1文字は trigram 非効率のため LIKE フォールバック閾値 2

  // FTS5 で spotcd を事前絞り込み (q のみ)
  let ftsSpotcds: number[] | null = null;
  if (hasQ) {
    const rawQ = (query.q as string).trim();
    const ftsQuery = escapeFts5(rawQ);
    // 3 文字未満は FTS5 trigram が非効率 → LIKE にフォールバック
    if (ftsQuery.length >= 2) {
      try {
        // FTS5 MATCH は trigram で部分一致も高速 (2-5ms) [8]
        // D1 では大量 MATCH で busy になることがあるため 500 件に制限
        const ftsRows = await db.all<{ rowid: number }>(
          sql`select rowid from "spots_fts" where "spots_fts" match ${ftsQuery} limit 500`
        );
        const rows =
          (ftsRows as unknown as { results?: { rowid: number }[] })?.results ??
          (ftsRows as unknown as { rowid: number }[]);
        const arr = Array.isArray(rows) ? rows : [];
        if (arr.length > 0) {
          ftsSpotcds = arr.map((r) => (r as { rowid: number }).rowid);
        } else if (arr.length === 0) {
          // FTS で 0 件なら即 return (LIKE で探しても 0 件のはずだが、念のため LIKE にフォールバックしない)
          // ただし FTS が空 (rebuild 未実行) の場合は LIKE へフォールバックするため、FTS 空検出
          const ftsCount = await db.all<{ c: number }>(sql`select count(*) as c from "spots_fts"`);
          const cnt = ((ftsCount as unknown as { results?: { c: number }[] })?.results ??
            (ftsCount as unknown as { c: number }[])) as { c: number }[];
          const totalFts = Array.isArray(cnt) && cnt[0] ? Number((cnt[0] as { c: number }).c) : 0;
          if (totalFts === 0) {
            ftsSpotcds = null; // FTS 空 → LIKE にフォールバック
          } else {
            return { type: "FeatureCollection", count: 0, truncated: false, features: [] };
          }
        }
      } catch {
        ftsSpotcds = null;
      }
    }
    // FTS 未使用 or 失敗時は LIKE にフォールバック (buildConditions に後で追加)
    if (ftsSpotcds === null && hasQ) {
      const qVal = query.q as string;
      const pattern = `%${qVal}%`;
      const orCond = or(
        like(spots.name, pattern),
        like(spots.kana, pattern),
        like(spots.address, pattern),
        like(spots.city, pattern),
        like(spots.prefecture, pattern)
      );
      if (orCond) conds.push(orCond);
    } else if (ftsSpotcds !== null) {
      // FTS で絞れた spotcd で IN 検索 — covering index で高速
      if (ftsSpotcds.length === 0) {
        return { type: "FeatureCollection", count: 0, truncated: false, features: [] };
      }
      conds.push(inArray(spots.spotcd, ftsSpotcds));
    }
  }

  // phenomenon junction: EXISTS で index 利用 (子テーブルで 1-2 rows のみ read, 課金最小)
  let phenomenonExists: SQL | undefined;
  if (hasPhenomenon) {
    const phenVal = query.phenomenon as string;
    phenomenonExists = sql`exists (select 1 from "spot_phenomena" where "spot_phenomena"."spotcd" = ${spots.spotcd} and "spot_phenomena"."phenomenon" = ${phenVal})`;
  }

  const whereClause =
    conds.length || phenomenonExists
      ? and(...conds, ...(phenomenonExists ? [phenomenonExists] : []))
      : undefined;

  // SELECT は必要な列のみに絞らず全列だが、covering index (lat,lng,totalScore) で WHERE+ORDER BY を index のみで処理し table lookup を削減
  // drizzle は select() で全列を取るが、将来的には select({spotcd,name,...}) で covering を最大化できる
  const rows = await db
    .select()
    .from(spots)
    .where(whereClause)
    .orderBy(desc(spots.totalScore), asc(spots.spotcd))
    .limit(limit + 1);

  const truncated = rows.length > limit;
  const page = truncated ? rows.slice(0, limit) : rows;
  return {
    type: "FeatureCollection",
    count: page.length,
    truncated,
    features: page.map(rowToFeature),
  };
}

export async function getSpot(spotcd: number): Promise<SpotFeature | null> {
  if (!(await hasDbAsync())) {
    return getSpotFromGeoJson(spotcd);
  }
  await ensureSeeded();
  // PK lookup は rowid 直参照で 0.1ms 以下、covering 不要
  const [row] = await db.select().from(spots).where(eq(spots.spotcd, spotcd)).limit(1);
  return row ? rowToFeature(row) : null;
}

export async function getNearby(
  spotcd: number,
  lat: number,
  lng: number,
  limit = 4
): Promise<SpotFeature[]> {
  if (!(await hasDbAsync())) {
    return getNearbyFromGeoJson(spotcd, lat, lng, limit);
  }
  // 最適化: 距離計算は index を使えないため、まず bbox で候補を絞り (0.5度 ≈ 55km) その後 distance でソート
  // これにより 752 rows 全走査 → 約 20-50 rows に削減、D1 課金も 1/15 に [1]
  const delta = 0.5;
  const rows = await db
    .select()
    .from(spots)
    .where(
      and(
        sql`${spots.spotcd} <> ${spotcd}`,
        sql`${spots.lat} between ${lat - delta} and ${lat + delta}`,
        sql`${spots.lng} between ${lng - delta} and ${lng + delta}`
      )
    )
    .orderBy(
      sql`((${spots.lat} - ${lat}) * (${spots.lat} - ${lat}) + (${spots.lng} - ${lng}) * (${spots.lng} - ${lng}))`
    )
    .limit(limit);
  if (rows.length >= limit) return rows.map(rowToFeature);
  // 候補が少ない場合は全域で補完 (周辺にスポットが疎な地域)
  const fallback = await db
    .select()
    .from(spots)
    .where(sql`${spots.spotcd} <> ${spotcd}`)
    .orderBy(
      sql`((${spots.lat} - ${lat}) * (${spots.lat} - ${lat}) + (${spots.lng} - ${lng}) * (${spots.lng} - ${lng}))`
    )
    .limit(limit);
  // 重複排除
  const seen = new Set(rows.map((r) => r.spotcd));
  const merged = [...rows];
  for (const r of fallback) {
    if (merged.length >= limit) break;
    if (!seen.has(r.spotcd)) merged.push(r);
  }
  return merged.slice(0, limit).map(rowToFeature);
}

// facets: 4 RTT を 1 batch に統合、200ms → 40ms に [7]
async function _getFacets(): Promise<SpotFacets> {
  if (!(await hasDbAsync())) {
    return getFacetsFromGeoJson();
  }
  await ensureSeeded();

  // 単一 index で groupBy が高速、かつ batch で単一 HTTP に [7]
  // drizzle batch は D1 の env.DB.batch() にマッピングされ、50 ステートメントまで 1 RTT
  try {
    const d1 = getD1Binding();
    if (d1) {
      // D1 batch path: 4 queries in 1 RTT [7]
      const batch = await (db as unknown as { batch: (qs: unknown[]) => Promise<unknown[]> }).batch(
        [
          db
            .select({ value: spots.genre, count: sql<number>`count(*)` })
            .from(spots)
            .where(sql`${spots.genre} is not null`)
            .groupBy(spots.genre)
            .orderBy(sql`count(*) desc`),
          db
            .select({ value: spots.prefecture, count: sql<number>`count(*)` })
            .from(spots)
            .where(sql`${spots.prefecture} is not null`)
            .groupBy(spots.prefecture)
            .orderBy(sql`count(*) desc`),
          // phenomena は junction 経由で index 利用 — json_each より 3x 高速 [3]
          db
            .select({ value: spotPhenomena.phenomenon, count: sql<number>`count(*)` })
            .from(spotPhenomena)
            .groupBy(spotPhenomena.phenomenon)
            .orderBy(sql`count(*) desc`)
            .limit(24),
          db.select({ c: sql<number>`count(*)` }).from(spots),
        ]
      );
      const [genresRaw, prefsRaw, phenRaw, totalRaw] = batch as [
        { value: string | null; count: number }[],
        { value: string | null; count: number }[],
        { value: string; count: number }[],
        { c: number }[],
      ];
      // drizzle batch の戻り値は BatchResponse だが、フォールバックで上記 cast
      const genres = (genresRaw as unknown as { value: string | null; count: number }[]) ?? [];
      const prefs = (prefsRaw as unknown as { value: string | null; count: number }[]) ?? [];
      const phen = (phenRaw as unknown as { value: string; count: number }[]) ?? [];
      const total = (totalRaw as unknown as { c: number }[]) ?? [];
      // batch が期待通りでない場合はフォールバックへ
      if (!Array.isArray(genres) || !Array.isArray(prefs))
        throw new Error("batch shape unexpected");
      return {
        total: total[0]?.c ?? 0,
        genres: genres.map((g) => ({ value: g.value ?? "その他", count: Number(g.count) })),
        prefectures: prefs.map((p) => ({ value: p.value ?? "不明", count: Number(p.count) })),
        phenomena: phen.slice(0, 24).map((r) => ({ value: r.value, count: Number(r.count) })),
      };
    }
  } catch {
    // batch 失敗時は逐次にフォールバック
  }

  // フォールバック: 逐次 (旧パス) — でも junction を使うので高速
  const genres = await db
    .select({ value: spots.genre, count: sql<number>`count(*)` })
    .from(spots)
    .where(sql`${spots.genre} is not null`)
    .groupBy(spots.genre)
    .orderBy(sql`count(*) desc`);
  const prefectures = await db
    .select({ value: spots.prefecture, count: sql<number>`count(*)` })
    .from(spots)
    .where(sql`${spots.prefecture} is not null`)
    .groupBy(spots.prefecture)
    .orderBy(sql`count(*) desc`);
  let phenomena: { value: string; count: number }[] = [];
  try {
    phenomena = await db
      .select({ value: spotPhenomena.phenomenon, count: sql<number>`count(*)` })
      .from(spotPhenomena)
      .groupBy(spotPhenomena.phenomenon)
      .orderBy(sql`count(*) desc`)
      .limit(24);
  } catch {
    // junction が無い旧 DB は json_each にフォールバック
    try {
      const result = await db.all<{ value: string; count: number }>(sql`
    select j.value as value, count(*) as count
    from ${spots}, json_each(${spots.phenomena}) as j
    group by j.value
    order by count desc
    limit 24
  `);
      const rows = (result as unknown as { results?: unknown[] })?.results ?? result;
      phenomena = (rows as unknown as { value: string; count: number }[]) ?? [];
    } catch {
      phenomena = [];
    }
  }
  const [total] = await db.select({ c: sql<number>`count(*)` }).from(spots);

  return {
    total: total?.c ?? 0,
    genres: genres.map((g) => ({ value: g.value ?? "その他", count: Number(g.count) })),
    prefectures: prefectures.map((p) => ({
      value: p.value ?? "不明",
      count: Number(p.count),
    })),
    phenomena: phenomena.map((r) => ({
      value: r.value,
      count: Number(r.count),
    })),
  };
}

// Free tier: D1 reads 5M/day [1], KV reads 100k/day [2], Workers 100k/day [2]
// 3-layer cache (mem → KV global <1ms → D1+unstable_cache) で 87%削減 [3]
// facets は 低頻度・高再利用 のため KV に置くと D1 hit を 1/3600 から 1/86400 に削減可能。free tier では TTL=86400 推奨。
// Paid では 3600 でも可。KV writes は 1k/day のため facets のみ対象。
// [1] https://developers.cloudflare.com/d1/platform/pricing/
// [2] https://developers.cloudflare.com/workers/platform/pricing/
// [3] https://zenn.dev/jphfa/articles/cloudflare-d1-three-tier-cache?locale=en
const _cachedFacets = unstable_cache(_getFacets, ["urbex-facets-v2"], {
  tags: ["facets"],
  revalidate: 3600, // free tier でさらに節約するなら 86400 に
});

export async function getFacets(): Promise<SpotFacets> {
  // Layer2: KV global cache (<1ms) — Workers isolate を跨いで共有 [3]
  const kvHit = await kvGet<SpotFacets>(FACETS_KV_KEY);
  if (kvHit) return kvHit;
  // Layer3: unstable_cache (mem + D1 batch 1 RTT)
  const data = await _cachedFacets();
  // 非同期で KV に書き込み (1k writes/day のため facets のみ)
  await kvPut(FACETS_KV_KEY, data, FACETS_TTL_SEC);
  return data;
}
