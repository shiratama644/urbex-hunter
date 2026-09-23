import { describe, expect, it } from "vitest";
import { clampBbox } from "@/lib/bbox";
import {
  clamp,
  clampLimit,
  clampQ,
  filterGeoJson,
  parseBbox,
  rowToFeature,
  scoreNearby,
} from "@/lib/spots-repo";
import type { SpotFeature } from "@/lib/types";
import { fearTone } from "@/lib/types";

// helper to build RawFeature-like object for filterGeoJson (uses SpotFeature shape but cast)
function makeRaw(
  overrides: Partial<{
    spotcd: number;
    name: string;
    kana: string | null;
    prefecture: string | null;
    city: string | null;
    genre: string | null;
    phenomena: string[];
    fearRating: number | null;
    coordinates: [number, number];
  }>
) {
  return {
    geometry: { coordinates: overrides.coordinates ?? [139.7, 35.6] },
    properties: {
      spotcd: overrides.spotcd ?? 1,
      name: overrides.name ?? "旧トンネル",
      kana: overrides.kana ?? null,
      address: null,
      prefecture: overrides.prefecture ?? "東京都",
      city: overrides.city ?? null,
      genre: overrides.genre ?? "トンネル",
      status: null,
      phenomena: overrides.phenomena ?? [],
      features: [],
      totalScore: null,
      nationalRank: null,
      prefRank: null,
      fearRating: overrides.fearRating ?? null,
      ratingCount: null,
      outline: null,
      comment: null,
      imageUrl: null,
      sourceUrl: "https://ghostmap.jp/spotdetail.php?spotcd=1",
    },
  } as unknown as {
    geometry: { coordinates: [number, number] };
    properties: SpotFeature["properties"];
  };
}

describe("clampBbox", () => {
  it("clamps -180..180 / -90..90", () => {
    expect(clampBbox([200, 100, -200, -100])).toEqual([180, 90, -180, -90]);
    expect(clampBbox([139.7, 35.6, 139.8, 35.7])).toEqual([139.7, 35.6, 139.8, 35.7]);
  });
  it("clamps padded bbox (MAP-1: pad 0.15)", () => {
    // simulate GhostMapApp padded bbox that overflows
    const bbox: [number, number, number, number] = [179, 89, 181, 91];
    expect(clampBbox(bbox)).toEqual([179, 89, 180, 90]);
  });
});

describe("parseBbox", () => {
  it("clamps", () => {
    expect(parseBbox("999,999,999,999")).toEqual([180, 90, 180, 90]);
    expect(parseBbox("-999,-999,999,999")).toEqual([-180, -90, 180, 90]);
  });
  it("swaps min/max", () => {
    expect(parseBbox("140,36,139,35")).toEqual([139, 35, 140, 36]);
    expect(parseBbox("140,35,139,36")).toEqual([139, 35, 140, 36]);
  });
  it("returns undefined for invalid", () => {
    expect(parseBbox(null)).toBeUndefined();
    expect(parseBbox("a,b,c,d")).toBeUndefined();
    expect(parseBbox("1,2,3")).toBeUndefined();
    expect(parseBbox("")).toBeUndefined();
  });
  it("clamps after swap", () => {
    expect(parseBbox("200,100,-200,-100")).toEqual([-180, -90, 180, 90]);
  });
});

describe("clampLimit", () => {
  it("clamps 1..3000", () => {
    expect(clampLimit(0)).toBe(1500);
    expect(clampLimit(-5)).toBe(1500);
    expect(clampLimit(100000)).toBe(3000);
    expect(clampLimit(1)).toBe(1);
    expect(clampLimit(1500)).toBe(1500);
    expect(clampLimit(3000)).toBe(3000);
  });
  it("handles string", () => {
    expect(clampLimit("500")).toBe(500);
    expect(clampLimit("abc")).toBe(1500);
  });
  it("handles NaN/undefined", () => {
    expect(clampLimit(Number.NaN)).toBe(1500);
    expect(clampLimit(undefined)).toBe(1500);
  });
});

describe("clampQ", () => {
  it("truncates 100", () => {
    const long = "a".repeat(200);
    expect(clampQ(long)?.length).toBe(100);
  });
  it("trims and handles empty", () => {
    expect(clampQ("  ")).toBeUndefined();
    expect(clampQ("  hello ")).toBe("hello");
    expect(clampQ(null as unknown as string)).toBeUndefined();
  });
});

describe("clamp", () => {
  it("clamps correctly", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

describe("filterGeoJson", () => {
  const base = [
    makeRaw({
      spotcd: 1,
      prefecture: "東京都",
      genre: "トンネル",
      fearRating: 4.5,
      coordinates: [139.7, 35.6],
    }),
    makeRaw({
      spotcd: 2,
      prefecture: "大阪府",
      genre: "住居",
      fearRating: 2.0,
      coordinates: [135.5, 34.6],
    }),
    makeRaw({
      spotcd: 3,
      prefecture: "東京都",
      genre: "トンネル",
      phenomena: ["足音"],
      fearRating: 3.8,
      coordinates: [139.8, 35.7],
    }),
  ];

  it("filters by bbox", () => {
    const res = filterGeoJson(base, { bbox: [139.6, 35.5, 139.9, 35.8] });
    expect(res.map((f) => f.properties.spotcd).sort()).toEqual([1, 3]);
  });
  it("filters by genre", () => {
    const res = filterGeoJson(base, { genre: ["トンネル"] });
    expect(res.length).toBe(2);
  });
  it("filters by pref", () => {
    const res = filterGeoJson(base, { pref: ["大阪府"] });
    expect(res[0].properties.spotcd).toBe(2);
  });
  it("filters by minRating", () => {
    const res = filterGeoJson(base, { minRating: 4 });
    expect(res.map((f) => f.properties.spotcd)).toEqual([1]);
  });
  it("filters by q", () => {
    const res = filterGeoJson(base, { q: "大阪" });
    expect(res.length).toBe(1);
    expect(res[0].properties.prefecture).toBe("大阪府");
  });
  it("filters by phenomenon", () => {
    const res = filterGeoJson(base, { phenomenon: "足音" });
    expect(res.length).toBe(1);
  });
  it("returns all when no query", () => {
    expect(filterGeoJson(base, {})).toHaveLength(3);
  });
});

describe("fearTone", () => {
  it("thresholds", () => {
    expect(fearTone(4.2).label).toBe("極度");
    expect(fearTone(4.5).label).toBe("極度");
    expect(fearTone(3.6).label).toBe("高");
    expect(fearTone(3.7).label).toBe("高");
    expect(fearTone(3.0).label).toBe("中");
    expect(fearTone(3.2).label).toBe("中");
    expect(fearTone(1.5).label).toBe("低");
    expect(fearTone(null).label).toBe("未評価");
    expect(fearTone(0).label).toBe("未評価");
  });
});

describe("scoreNearby (API-2 / DB-2: nearby 4件の除外と距離順)", () => {
  const base = [
    makeRaw({ spotcd: 1, coordinates: [139.7, 35.6] }),
    makeRaw({ spotcd: 2, coordinates: [139.71, 35.61] }), // nearest to 1
    makeRaw({ spotcd: 3, coordinates: [135.5, 34.6] }), // far
    makeRaw({ spotcd: 4, coordinates: [139.72, 35.62] }), // 2nd nearest
    makeRaw({ spotcd: 5, coordinates: [139.69, 35.59] }), // 3rd
  ];

  it("excludes self spotcd", () => {
    const res = scoreNearby(base as never, 35.6, 139.7, 1);
    expect(res.every(({ f }) => f.properties.spotcd !== 1)).toBe(true);
  });

  it("sorts by Euclidean distance squared", () => {
    const res = scoreNearby(base as never, 35.6, 139.7, 1);
    // 2 and 5 are both 0.01° away (tie) — stable sort keeps original order, but allow either
    const ids = res.map(({ f }) => f.properties.spotcd);
    expect(ids.slice(0, 2).sort()).toEqual([2, 5]);
    expect(ids.slice(2)).toEqual([4, 3]);
  });

  it("limit 4 is applied by caller (slice)", () => {
    const res = scoreNearby(base as never, 35.6, 139.7, 99).slice(0, 4);
    expect(res).toHaveLength(4);
    expect(res.map(({ f }) => f.properties.spotcd)).not.toContain(99);
  });
});

describe("rowToFeature (DB-1: seed 冪等の reversible)", () => {
  it("maps db row to GeoJSON feature", () => {
    const row = {
      spotcd: 123,
      name: "旧トンネル",
      kana: "きゅうとんねる",
      address: "東京都",
      prefecture: "東京都",
      city: null,
      lat: 35.6,
      lng: 139.7,
      genre: "トンネル",
      status: null,
      phenomena: ["足音"],
      features: [],
      totalScore: 80,
      nationalRank: 10,
      prefRank: 2,
      fearRating: 3.8,
      ratingCount: 50,
      outline: null,
      comment: null,
      imageUrl: null,
      sourceUrl: "https://ghostmap.jp/spotdetail.php?spotcd=123",
      updatedAt: new Date(),
    } as never;
    const feat = rowToFeature(row);
    expect(feat.geometry.coordinates).toEqual([139.7, 35.6]);
    expect(feat.properties.spotcd).toBe(123);
    expect(feat.properties.fearRating).toBe(3.8);
  });
});

describe("filterGeoJson complex (API-1: N+1代替の in-memory 絞り込み)", () => {
  const base = [
    makeRaw({
      spotcd: 1,
      genre: "トンネル",
      prefecture: "東京都",
      phenomena: ["足音"],
      fearRating: 4.5,
      coordinates: [139.7, 35.6],
    }),
    makeRaw({
      spotcd: 2,
      genre: "トンネル",
      prefecture: "大阪府",
      phenomena: ["足音"],
      fearRating: 2.0,
      coordinates: [135.5, 34.6],
    }),
    makeRaw({
      spotcd: 3,
      genre: "住居",
      prefecture: "東京都",
      phenomena: ["気配"],
      fearRating: 3.8,
      coordinates: [139.8, 35.7],
    }),
  ];
  it("phenomenon + minRating 複合で絞り込む", () => {
    const res = filterGeoJson(base, { phenomenon: "足音", minRating: 4 });
    expect(res.map((f) => f.properties.spotcd)).toEqual([1]);
  });
  it("genre + pref + q 複合で 1件に絞る（q は name にヒット）", () => {
    const res = filterGeoJson(base, { genre: ["トンネル"], pref: ["東京都"], q: "トンネル" });
    expect(res.map((f) => f.properties.spotcd)).toEqual([1]);
  });
});
