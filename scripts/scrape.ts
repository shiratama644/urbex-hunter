/**
 * 全国心霊マップ (https://ghostmap.jp/) スクレイパー
 * ------------------------------------------------------------
 * 使い方:
 *   npx tsx scripts/scrape.ts                # 全都道府県 / 1県あたり既定件数
 *   LIMIT_PER_PREF=5 npx tsx scripts/scrape.ts
 *   PREFS=13,27 npx tsx scripts/scrape.ts
 *
 * 出力: data/spots.geojson (FeatureCollection)
 *
 * 注意: 相手サーバーに負荷を掛けないよう、同時接続数と待機時間を制御しています。
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";

const BASE = "https://ghostmap.jp";
const UA = "Mozilla/5.0 (compatible; GhostMapStudyBot/1.0; +https://example.com/bot)";

const PREFECTURES: { code: number; name: string }[] = [
  { code: 1, name: "北海道" },
  { code: 2, name: "青森県" },
  { code: 3, name: "岩手県" },
  { code: 4, name: "宮城県" },
  { code: 5, name: "秋田県" },
  { code: 6, name: "山形県" },
  { code: 7, name: "福島県" },
  { code: 8, name: "茨城県" },
  { code: 9, name: "栃木県" },
  { code: 10, name: "群馬県" },
  { code: 11, name: "埼玉県" },
  { code: 12, name: "千葉県" },
  { code: 13, name: "東京都" },
  { code: 14, name: "神奈川県" },
  { code: 15, name: "新潟県" },
  { code: 16, name: "富山県" },
  { code: 17, name: "石川県" },
  { code: 18, name: "福井県" },
  { code: 19, name: "山梨県" },
  { code: 20, name: "長野県" },
  { code: 21, name: "岐阜県" },
  { code: 22, name: "静岡県" },
  { code: 23, name: "愛知県" },
  { code: 24, name: "三重県" },
  { code: 25, name: "滋賀県" },
  { code: 26, name: "京都府" },
  { code: 27, name: "大阪府" },
  { code: 28, name: "兵庫県" },
  { code: 29, name: "奈良県" },
  { code: 30, name: "和歌山県" },
  { code: 31, name: "鳥取県" },
  { code: 32, name: "島根県" },
  { code: 33, name: "岡山県" },
  { code: 34, name: "広島県" },
  { code: 35, name: "山口県" },
  { code: 36, name: "徳島県" },
  { code: 37, name: "香川県" },
  { code: 38, name: "愛媛県" },
  { code: 39, name: "高知県" },
  { code: 40, name: "福岡県" },
  { code: 41, name: "佐賀県" },
  { code: 42, name: "長崎県" },
  { code: 43, name: "熊本県" },
  { code: 44, name: "大分県" },
  { code: 45, name: "宮崎県" },
  { code: 46, name: "鹿児島県" },
  { code: 47, name: "沖縄県" },
];

export type SpotProps = {
  spotcd: number;
  name: string;
  kana: string | null;
  address: string | null;
  prefecture: string | null;
  city: string | null;
  genre: string | null;
  status: string | null;
  phenomena: string[];
  features: string[];
  totalScore: number | null;
  nationalRank: number | null;
  prefRank: number | null;
  fearRating: number | null;
  ratingCount: number | null;
  outline: string | null;
  comment: string | null;
  imageUrl: string | null;
  sourceUrl: string;
};

export type SpotFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: SpotProps;
};

const num = (raw?: string | null): number | null => {
  if (!raw) return null;
  const cleaned = raw.replace(/[,，\s]/g, "").match(/-?\d+(\.\d+)?/);
  return cleaned ? Number(cleaned[0]) : null;
};

const clean = (raw?: string | null): string | null => {
  if (!raw) return null;
  const t = raw
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.length ? t : null;
};

async function fetchHtml(url: string, retries = 2): Promise<string | null> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, "Accept-Language": "ja" },
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (i === retries) {
        console.warn(`  ! failed ${url}: ${(err as Error).message}`);
        return null;
      }
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  return null;
}

/** 都道府県一覧ページから spotcd を抽出 */
export async function listSpotIds(precd: number): Promise<number[]> {
  const html = await fetchHtml(`${BASE}/spotlist.php?precd=${precd}`);
  if (!html) return [];
  const ids = new Set<number>();
  for (const m of html.matchAll(/spotdetail\.php\?spotcd=(\d+)/g)) {
    ids.add(Number(m[1]));
  }
  return [...ids];
}

/** 詳細ページ HTML をパース */
export function parseSpot(html: string, spotcd: number): SpotFeature | null {
  const $ = cheerio.load(html);

  const name = clean($("#sub_title_h1 p").first().text());
  if (!name) return null;

  // 緯度経度: 「Googleマップを開く」リンクのクエリから正規表現で抽出
  let lat: number | null = null;
  let lng: number | null = null;
  const gmap = html.match(/maps\?q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (gmap) {
    lat = Number(gmap[1]);
    lng = Number(gmap[2]);
  } else {
    const jsonLat = html.match(/"latitude"\s*:\s*"?(-?\d+\.\d+)/);
    const jsonLng = html.match(/"longitude"\s*:\s*"?(-?\d+\.\d+)/);
    if (jsonLat && jsonLng) {
      lat = Number(jsonLat[1]);
      lng = Number(jsonLng[1]);
    }
  }
  if (lat === null || lng === null || Number.isNaN(lat) || Number.isNaN(lng)) {
    return null;
  }

  // 概要テーブル (th ラベル -> td)
  const table: Record<string, string> = {};
  $("table.table_outline tr").each((_, tr) => {
    const th = clean($(tr).find("th").first().text());
    const tdEl = $(tr).find("td").first();
    if (!th) return;
    tdEl.find("a,input,img,script").remove();
    const td = clean(tdEl.text());
    if (td) table[th] = td;
  });

  // 住所（Googleマップを開く等のリンク文言は除去済み）
  const addrEl = $("#table_outline_map").clone();
  addrEl.find("a,br,img,input").remove();
  const address = clean(addrEl.text()) ?? table["住所"] ?? null;

  // パンくずから都道府県 / 市区町村
  const crumbs = $(".pankz_list_item a")
    .map((_, a) => clean($(a).text()) ?? "")
    .get()
    .filter(Boolean);
  const prefecture =
    PREFECTURES.map((p) => p.name).find((p) => crumbs.includes(p)) ??
    (address ? (address.match(/(東京都|北海道|(?:京都|大阪)府|..県)/)?.[1] ?? null) : null);
  const city = crumbs.find((c) => /[市区町村郡]$/.test(c) && c !== prefecture) ?? null;

  // タグ群（特徴・心霊現象）
  const tagGroups: Record<string, string[]> = {};
  $("#tag_area dt").each((_, dt) => {
    const label = (clean($(dt).text()) ?? "").replace(/[:：]$/, "");
    const items = $(dt)
      .next("dd")
      .find("li a")
      .map((_i, a) => clean($(a).text()) ?? "")
      .get()
      .filter(Boolean);
    tagGroups[label] = items;
  });

  const headValue = (label: string): number | null => {
    let out: number | null = null;
    $("#head_point .head_point_item").each((_, li) => {
      const title = clean($(li).find(".head_point_item_title").text());
      if (title === label) {
        out = num($(li).find(".head_point_item_detail_value").text());
      }
    });
    return out;
  };

  const genre =
    (tagGroups["ジャンル"] ?? []).find((g) => !/地方|[都道府県]の/.test(g)) ??
    table["ジャンル"] ??
    null;

  const image = $("#outline_image img").attr("src");
  const imageUrl = image ? new URL(image.replace(/^\.\.\//, "/"), BASE).toString() : null;

  const properties: SpotProps = {
    spotcd,
    name,
    kana: table["読み方"] ?? null,
    address,
    prefecture,
    city,
    genre,
    status: table["状態"] ?? null,
    phenomena: tagGroups["心霊現象"] ?? [],
    features: (tagGroups["特徴"] ?? []).filter((f) => !/地方/.test(f)),
    totalScore: headValue("総合得点"),
    nationalRank: headValue("全国ランク"),
    prefRank: headValue("県別ランク"),
    fearRating: num($("#eval_point").first().text()),
    ratingCount: num($("#eval_row").first().text()) ?? headValue("評価人数"),
    outline: clean($("#outline_spot").text()),
    comment: table["コメント"] ?? null,
    imageUrl,
    sourceUrl: `${BASE}/spotdetail.php?spotcd=${spotcd}`,
  };

  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lng, lat] },
    properties,
  };
}

export async function scrapeSpot(spotcd: number): Promise<SpotFeature | null> {
  const html = await fetchHtml(`${BASE}/spotdetail.php?spotcd=${spotcd}`);
  if (!html) return null;
  try {
    return parseSpot(html, spotcd);
  } catch (err) {
    console.warn(`  ! parse error ${spotcd}: ${(err as Error).message}`);
    return null;
  }
}

async function pool<T, R>(items: T[], size: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let cursor = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      out[idx] = await worker(items[idx]);
    }
  });
  await Promise.all(runners);
  return out;
}

async function main() {
  const limitPerPref = Number(process.env.LIMIT_PER_PREF ?? 16);
  const concurrency = Number(process.env.CONCURRENCY ?? 8);
  const only = process.env.PREFS?.split(",").map(Number).filter(Boolean);
  const targets = only ? PREFECTURES.filter((p) => only.includes(p.code)) : PREFECTURES;

  const outPath = path.join(process.cwd(), "data", "spots.geojson");
  const existing = new Map<number, SpotFeature>();
  try {
    const prev = JSON.parse(await readFile(outPath, "utf8")) as {
      features: SpotFeature[];
    };
    for (const f of prev.features) existing.set(f.properties.spotcd, f);
    console.log(`既存データ ${existing.size} 件を読み込みました`);
  } catch {
    /* 初回実行 */
  }

  for (const pref of targets) {
    const ids = (await listSpotIds(pref.code)).slice(0, limitPerPref);
    console.log(`[${pref.name}] ${ids.length} 件を取得中...`);
    const results = await pool(ids, concurrency, scrapeSpot);
    let ok = 0;
    for (const f of results) {
      if (f) {
        existing.set(f.properties.spotcd, f);
        ok++;
      }
    }
    console.log(`[${pref.name}] ${ok} 件 取得成功 (累計 ${existing.size})`);
  }

  const features = [...existing.values()].sort(
    (a, b) => (b.properties.totalScore ?? 0) - (a.properties.totalScore ?? 0)
  );

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(
    outPath,
    JSON.stringify(
      {
        type: "FeatureCollection",
        generatedAt: new Date().toISOString(),
        source: BASE,
        features,
      },
      null,
      1
    ),
    "utf8"
  );
  console.log(`✅ ${features.length} 件を ${outPath} に書き出しました`);
}

if (process.argv[1] && process.argv[1].includes("scrape")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
