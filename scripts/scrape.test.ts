import { describe, expect, it } from "vitest";
import { parseSpot } from "./scrape";

// helper to build minimal detail HTML for parseSpot
function buildHtml(opts: {
  name?: string;
  lat?: number;
  lng?: number;
  latPattern?: "gmap" | "json" | "data";
  kana?: string;
  nearestStation?: string;
  access?: string;
  facilities?: string;
  postInfo?: string;
  ghostVote?: string;
  updatedAt?: string;
  faq?: string;
}) {
  const name = opts.name ?? "テストトンネル";
  const lat = opts.lat ?? 35.681236;
  const lng = opts.lng ?? 139.767125;
  let coordHtml = "";
  if (opts.latPattern === "json") {
    coordHtml = `<script>var data = {"latitude": "${lat}", "longitude": "${lng}"};</script>`;
  } else if (opts.latPattern === "data") {
    coordHtml = `<div data-lat="${lat}" data-lng="${lng}"></div>`;
  } else {
    coordHtml = `<a href="https://www.google.co.jp/maps?q=${lat},${lng}">Googleマップを開く</a>`;
  }

  const kanaRow = opts.kana ? `<tr><th>読み方</th><td>${opts.kana}</td></tr>` : "";
  const stationRow = opts.nearestStation
    ? `<tr><th>最寄り駅</th><td>${opts.nearestStation}</td></tr>`
    : "";
  const accessRow = opts.access ? `<tr><th>アクセス</th><td>${opts.access}</td></tr>` : "";
  const facilitiesRow = opts.facilities
    ? `<tr><th>周辺施設</th><td>${opts.facilities}</td></tr>`
    : "";
  const postInfoRow = opts.postInfo ? `<tr><th>投稿情報</th><td>${opts.postInfo}</td></tr>` : "";

  const ghostHtml = opts.ghostVote ?? "";
  const updatedHtml = opts.updatedAt ? `<div>更新日:${opts.updatedAt}</div>` : "";
  const faqHtml = opts.faq ?? "";

  return `
  <html><body>
    <div id="sub_title_h1"><p>${name}</p></div>
    ${coordHtml}
    <table class="table_outline">
      ${kanaRow}
      ${stationRow}
      ${accessRow}
      ${facilitiesRow}
      ${postInfoRow}
      <tr><th>ジャンル</th><td>トンネル</td></tr>
    </table>
    <div id="table_outline_map"></div>
    <div id="head_point">
      <div class="head_point_item"><span class="head_point_item_title">総合得点</span><span class="head_point_item_detail_value">80</span></div>
    </div>
    <div id="eval_point">3.8</div>
    <div id="eval_row">10人</div>
    <div id="outline_spot">概要テキスト</div>
    <div id="tag_area">
      <dl><dt>ジャンル</dt><dd><ul><li><a>トンネル</a></li></ul></dd></dl>
      <dl><dt>心霊現象</dt><dd><ul><li><a>足音</a></li></ul></dd></dl>
    </div>
    <div id="outline_image"><img src="/img/spot/20240101123456789.jpg" /></div>
    ${ghostHtml}
    ${updatedHtml}
    ${faqHtml}
  </body></html>`;
}

describe("parseSpot coordinate 3 patterns (SCR-2)", () => {
  it("pattern 1: maps?q=lat,lng", () => {
    const html = buildHtml({ lat: 35.1, lng: 139.1, latPattern: "gmap" });
    const f = parseSpot(html, 1);
    expect(f?.geometry.coordinates).toEqual([139.1, 35.1]);
  });
  it('pattern 2: "latitude" JSON', () => {
    const html = buildHtml({ lat: 35.2, lng: 139.2, latPattern: "json" });
    const f = parseSpot(html, 2);
    expect(f?.geometry.coordinates).toEqual([139.2, 35.2]);
  });
  it("pattern 3: data-lat/data-lng", () => {
    const html = buildHtml({ lat: 35.3, lng: 139.3, latPattern: "data" });
    const f = parseSpot(html, 3);
    expect(f?.geometry.coordinates).toEqual([139.3, 35.3]);
  });
  it("returns null when no coordinate", () => {
    const html = `<html><body><div id="sub_title_h1"><p>名無し</p></div></body></html>`;
    expect(parseSpot(html, 99)).toBeNull();
  });
  it("returns null when name missing", () => {
    const html = `<html><body><a href="https://www.google.co.jp/maps?q=35,139">map</a></body></html>`;
    expect(parseSpot(html, 100)).toBeNull();
  });
});

describe("parseSpot extra fields (SCR-3 extensibility)", () => {
  it("parses nearestStation / access / surroundingFacilities", () => {
    const html = buildHtml({
      nearestStation: "土浦駅",
      access: "土浦駅から徒歩52分",
      facilities: "マイアミショッピングセンター<br>スーパータイヨー阿見店",
    });
    const f = parseSpot(html, 10);
    expect(f?.properties.nearestStation).toBe("土浦駅");
    expect(f?.properties.access).toBe("土浦駅から徒歩52分");
    expect(f?.properties.surroundingFacilities.length).toBeGreaterThan(0);
  });

  it("parses postInfo counts", () => {
    const html = buildHtml({
      postInfo: "写真1枚、動画0件、ストリートビュー0件、体験談0話、コメント5件",
    });
    const f = parseSpot(html, 11);
    expect(f?.properties.photoCount).toBe(1);
    expect(f?.properties.videoCount).toBe(0);
    expect(f?.properties.streetViewCount).toBe(0);
    expect(f?.properties.experienceCount).toBe(0);
    expect(f?.properties.commentCount).toBe(5);
  });

  it("parses ghostTypes voting", () => {
    const html = buildHtml({
      ghostVote: `<div>少年0 少女0 男性1 女性2 老爺0 老婆0 動物0 正体不明3</div>`,
    });
    const f = parseSpot(html, 12);
    expect(f?.properties.ghostTypes).toEqual(
      expect.objectContaining({ 男性: 1, 女性: 2, 正体不明: 3 })
    );
  });

  it("parses updatedAt", () => {
    const html = buildHtml({ updatedAt: "2026/09/22" });
    const f = parseSpot(html, 13);
    expect(f?.properties.updatedAt).toBe("2026-09-22");
  });

  it("handles missing extra fields as null (backward compat)", () => {
    const html = buildHtml({});
    const f = parseSpot(html, 14);
    expect(f?.properties.nearestStation).toBeNull();
    expect(f?.properties.ghostTypes).toBeNull();
    expect(f?.properties.photoCount).toBeNull();
    expect(f?.properties.updatedAt).toBeNull();
    expect(f?.properties.faq).toBeNull();
  });

  it("fullwidth numbers in counts are handled", () => {
    const html = buildHtml({
      postInfo: "写真１枚、動画０件、ストリートビュー０件、体験談０話、コメント０件",
    });
    const f = parseSpot(html, 15);
    expect(f?.properties.photoCount).toBe(1);
  });
});
