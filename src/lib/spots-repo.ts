import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { and, asc, desc, eq, gte, ilike, inArray, or, type SQL, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db, isDbConfigured } from "@/db";
import { type NewSpotRow, type SpotRow, spots } from "@/db/schema";
import type { SpotCollection, SpotFacets, SpotFeature, SpotProperties } from "@/lib/types";

const GEOJSON_PATH = path.join(process.cwd(), "data", "spots.geojson");

type RawFeature = {
  geometry: { coordinates: [number, number] };
  properties: SpotProperties;
};

export type { RawFeature };

let seedPromise: Promise<void> | null = null;

// ---------- GeoJSON memoization (mtime + size) ----------
let geoJsonCache: { mtimeMs: number; size: number; data: RawFeature[] } | null = null;

async function readGeoJson(): Promise<RawFeature[]> {
  const s = await stat(GEOJSON_PATH);
  if (geoJsonCache && geoJsonCache.mtimeMs === s.mtimeMs && geoJsonCache.size === s.size) {
    return geoJsonCache.data;
  }
  const raw = await readFile(GEOJSON_PATH, "utf8");
  const parsed = JSON.parse(raw) as { features: RawFeature[] };
  const data = parsed.features ?? [];
  geoJsonCache = { mtimeMs: s.mtimeMs, size: s.size, data };
  return data;
}

/** テスト用: キャッシュをクリア */
export function __clearGeoJsonCache() {
  geoJsonCache = null;
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

// ---------- GeoJSON fallback helpers (when DATABASE_URL is not set) ----------

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
  const features = await readGeoJson();
  const filtered = filterGeoJson(features, query);
  // 同じソート: totalScore desc, spotcd asc
  filtered.sort((a, b) => {
    const sa = a.properties.totalScore ?? -1;
    const sb = b.properties.totalScore ?? -1;
    if (sb !== sa) return sb - sa;
    return a.properties.spotcd - b.properties.spotcd;
  });
  const limit = clampLimit(query.limit, 1500);
  const truncated = filtered.length > limit;
  const page = truncated ? filtered.slice(0, limit) : filtered;
  return {
    type: "FeatureCollection",
    count: page.length,
    truncated,
    features: page.map(rawToFeature),
  };
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

/** pure helper for nearby ranking — ユークリッド二乗で順序付け（日本国内 24..46° では haversine と順序は一致、Phase 2 API-2） */
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

async function tableReady(): Promise<boolean> {
  if (!isDbConfigured) return false;
  try {
    await db.execute(sql`select 1 from ${spots} limit 1`);
    return true;
  } catch {
    return false;
  }
}

async function createTableIfMissing() {
  if (!isDbConfigured) return;
  try {
    await db.execute(sql`
    create table if not exists "spots" (
      "spotcd" integer primary key,
      "name" text not null,
      "kana" text,
      "address" text,
      "prefecture" text,
      "city" text,
      "lat" double precision not null,
      "lng" double precision not null,
      "genre" text,
      "status" text,
      "phenomena" text[] not null default '{}',
      "features" text[] not null default '{}',
      "total_score" integer,
      "national_rank" integer,
      "pref_rank" integer,
      "fear_rating" real,
      "rating_count" integer,
      "outline" text,
      "comment" text,
      "image_url" text,
      "source_url" text not null,
      "updated_at" timestamptz not null default now()
    )
    `);
    await db.execute(sql`create index if not exists "spots_pref_idx" on "spots" ("prefecture")`);
    await db.execute(sql`create index if not exists "spots_genre_idx" on "spots" ("genre")`);
    await db.execute(sql`create index if not exists "spots_bbox_idx" on "spots" ("lat","lng")`);
  } catch (error) {
    // 並列プロセスが同時に CREATE TABLE した場合の競合は無視して続行
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
    phenomena: p.phenomena ?? [],
    features: p.features ?? [],
    totalScore: p.totalScore ?? null,
    nationalRank: p.nationalRank ?? null,
    prefRank: p.prefRank ?? null,
    fearRating: p.fearRating ?? null,
    ratingCount: p.ratingCount ?? null,
    outline: p.outline ?? null,
    comment: p.comment ?? null,
    imageUrl: p.imageUrl ?? null,
    sourceUrl: p.sourceUrl,
  };
}

/** GeoJSON から DB へ upsert（冪等） */
export async function importGeoJsonIntoDb(): Promise<number> {
  if (!isDbConfigured) throw new Error("DATABASE_URL is not configured");
  await createTableIfMissing();
  const features = await readGeoJson();
  const rows = features.map(toRow);
  const chunk = 250;
  for (let i = 0; i < rows.length; i += chunk) {
    await db
      .insert(spots)
      .values(rows.slice(i, i + chunk))
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
          updatedAt: sql`now()`,
        },
      });
  }
  return rows.length;
}

/** 初回アクセス時にテーブルが空ならシードする */
export async function ensureSeeded(): Promise<void> {
  if (!isDbConfigured) return;
  if (!seedPromise) {
    seedPromise = (async () => {
      if (!(await tableReady())) {
        await createTableIfMissing();
      }
      // 複数プロセス（ビルドワーカー等）の同時シードを防ぐ (transaction scoped lock)
      await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(918273645)`);
        const [row] = await tx.select({ c: sql<number>`count(*)::int` }).from(spots);
        if (!row || row.c === 0) await importGeoJsonIntoDb();
      });
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
  // Phase 3 拡張フィールドは将来の DB カラム（nearestStation等）があれば透過、無ければ undefined→null 扱い
  const r = row as unknown as Record<string, unknown>;
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
      phenomena: row.phenomena ?? [],
      features: row.features ?? [],
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

function buildConditions(query: SpotQuery): SQL[] {
  const conds: SQL[] = [];
  if (query.bbox) {
    const [minLng, minLat, maxLng, maxLat] = query.bbox;
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
  if (query.phenomenon) {
    conds.push(sql`${query.phenomenon} = any(${spots.phenomena})`);
  }
  if (typeof query.minRating === "number" && query.minRating > 0) {
    conds.push(gte(spots.fearRating, query.minRating));
  }
  if (query.q) {
    const like = `%${query.q}%`;
    const orCond = or(
      ilike(spots.name, like),
      ilike(spots.kana, like),
      ilike(spots.address, like),
      ilike(spots.city, like),
      ilike(spots.prefecture, like)
    );
    if (orCond) conds.push(orCond);
  }
  return conds;
}

export async function querySpots(query: SpotQuery): Promise<SpotCollection> {
  if (!isDbConfigured) {
    return querySpotsFromGeoJson(query);
  }
  await ensureSeeded();
  const limit = clampLimit(query.limit, 1500);
  const conds = buildConditions(query);
  const rows = await db
    .select()
    .from(spots)
    .where(conds.length ? and(...conds) : undefined)
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
  if (!isDbConfigured) {
    return getSpotFromGeoJson(spotcd);
  }
  await ensureSeeded();
  const [row] = await db.select().from(spots).where(eq(spots.spotcd, spotcd)).limit(1);
  return row ? rowToFeature(row) : null;
}

export async function getNearby(
  spotcd: number,
  lat: number,
  lng: number,
  limit = 4
): Promise<SpotFeature[]> {
  if (!isDbConfigured) {
    return getNearbyFromGeoJson(spotcd, lat, lng, limit);
  }
  const rows = await db
    .select()
    .from(spots)
    .where(sql`${spots.spotcd} <> ${spotcd}`)
    .orderBy(
      sql`((${spots.lat} - ${lat}) * (${spots.lat} - ${lat}) + (${spots.lng} - ${lng}) * (${spots.lng} - ${lng}))`
    )
    .limit(limit);
  return rows.map(rowToFeature);
}

// Phase 2 API-1: 4 query (genres/prefs/phenomena/total) は各 groupBy が index で高速、かつ unstable_cache 3600 で DB に当たらない。phenomena の unnest は将来 GIN (spots_phenomena_gin_idx) で改善（drizzle/0002_enable_pg_trgm.sql）
async function _getFacets(): Promise<SpotFacets> {
  if (!isDbConfigured) {
    return getFacetsFromGeoJson();
  }
  await ensureSeeded();
  const genres = await db
    .select({ value: spots.genre, count: sql<number>`count(*)::int` })
    .from(spots)
    .where(sql`${spots.genre} is not null`)
    .groupBy(spots.genre)
    .orderBy(sql`count(*) desc`);
  const prefectures = await db
    .select({ value: spots.prefecture, count: sql<number>`count(*)::int` })
    .from(spots)
    .where(sql`${spots.prefecture} is not null`)
    .groupBy(spots.prefecture)
    .orderBy(sql`count(*) desc`);
  const phenomena = await db.execute<{ value: string; count: number }>(sql`
    select unnest(phenomena) as value, count(*)::int as count
    from ${spots}
    group by 1
    order by count desc
    limit 24
  `);
  const [total] = await db.select({ c: sql<number>`count(*)::int` }).from(spots);

  return {
    total: total?.c ?? 0,
    genres: genres.map((g) => ({ value: g.value ?? "その他", count: g.count })),
    prefectures: prefectures.map((p) => ({
      value: p.value ?? "不明",
      count: p.count,
    })),
    phenomena: (phenomena.rows ?? []).map((r) => ({
      value: r.value,
      count: Number(r.count),
    })),
  };
}

// 1時間 cache（事実: unstable_cache + tags + revalidate 3600 が推奨）[1](https://nextjs.org/docs/app/api-reference/functions/unstable_cache)
export const getFacets: () => Promise<SpotFacets> = unstable_cache(_getFacets, ["urbex-facets"], {
  tags: ["facets"],
  revalidate: 3600,
});
