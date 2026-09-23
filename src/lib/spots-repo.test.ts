import { describe, expect, it } from "vitest";
import { clampBbox } from "@/lib/bbox";
import { clamp, clampLimit, clampQ, filterGeoJson, parseBbox } from "@/lib/spots-repo";
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
