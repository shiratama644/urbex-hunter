import { NextResponse } from "next/server";
import { getFacets } from "@/lib/spots-repo";

export const revalidate = 86400;

export async function GET() {
  try {
    const facets = await getFacets();
    return NextResponse.json(facets, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch (error) {
    console.error("[/api/facets]", error);
    return NextResponse.json({ error: "集計の取得に失敗しました" }, { status: 500 });
  }
}
