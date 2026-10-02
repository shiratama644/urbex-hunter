import { NextResponse } from "next/server";
import { getFacets } from "@/lib/spots-repo";

export const revalidate = 86400;

export async function GET() {
  try {
    const facets = await getFacets();
    // Free tier: facets は 24 writes/day (KV 1k 制限内) + D1 400 rows/read → 86400 cache で 1/day に
    return NextResponse.json(facets, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        "CDN-Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        "Cloudflare-CDN-Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        "Cache-Tag": "facets,api",
        Vary: "Accept-Encoding",
      },
    });
  } catch (error) {
    console.error("[/api/facets]", error);
    return NextResponse.json({ error: "集計の取得に失敗しました" }, { status: 500 });
  }
}
