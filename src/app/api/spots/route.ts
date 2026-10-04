import { NextResponse } from "next/server";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { clampLimit, clampQ, parseBbox, querySpots } from "@/lib/spots-repo";

// 1日1回の再検証（スクレイピングは週次のため十分）
export const revalidate = 86400;

const multi = (raw: string | null): string[] | undefined => {
  if (!raw) return undefined;
  const values = raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  return values.length ? values : undefined;
};

export async function GET(request: Request) {
  // 簡易 rate-limit: 60 req/min / IP（事実ベースの DoS 緩和）
  const ip = getClientIp(request);
  const rl = rateLimit(ip, 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "リクエストが多すぎます。しばらく待ってから再試行してください。" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)),
          "X-RateLimit-Limit": "60",
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  const { searchParams } = new URL(request.url);
  try {
    const bbox = parseBbox(searchParams.get("bbox"));
    const q = clampQ(searchParams.get("q"));
    const limitRaw = searchParams.get("limit");
    const limit = limitRaw === null ? undefined : clampLimit(limitRaw, 1500);
    const minRatingRaw = searchParams.get("min_rating");
    const minRating = minRatingRaw ? Number(minRatingRaw) : undefined;
    const minRatingClamped =
      typeof minRating === "number" && Number.isFinite(minRating) && minRating > 0
        ? Math.max(0, Math.min(5, minRating))
        : undefined;

    const collection = await querySpots({
      bbox,
      genre: multi(searchParams.get("genre")),
      pref: multi(searchParams.get("pref")),
      phenomenon: searchParams.get("phenomenon")?.trim() || undefined,
      minRating: minRatingClamped,
      q,
      limit,
    });

    // Free tier: Workers 100k/day [1], D1 5M rows/day [2] — edge cache で origin hit を 90%削減
    // s-maxage=86400 + stale-while-revalidate で CDN が 24h キャッシュ、D1 rows read を 1/100 に [3]
    // [1] https://developers.cloudflare.com/workers/platform/pricing/
    // [2] https://developers.cloudflare.com/d1/platform/pricing/
    // [3] https://zenn.dev/jphfa/articles/cloudflare-d1-three-tier-cache?locale=en
    return NextResponse.json(collection, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        "CDN-Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        "Cloudflare-CDN-Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        "Cache-Tag": "spots,api",
        Vary: "Accept-Encoding",
        "X-RateLimit-Limit": "60",
        "X-RateLimit-Remaining": String(rl.remaining),
      },
    });
  } catch (error) {
    console.error("[/api/spots]", error);
    return NextResponse.json({ error: "スポットの取得に失敗しました" }, { status: 500 });
  }
}
