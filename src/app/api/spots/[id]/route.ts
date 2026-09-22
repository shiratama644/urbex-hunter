import { NextResponse } from "next/server";
import { getNearby, getSpot } from "@/lib/spots-repo";

export const revalidate = 86400;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const spotcd = Number(id);
  if (!Number.isInteger(spotcd)) {
    return NextResponse.json({ error: "不正なIDです" }, { status: 400 });
  }
  try {
    const feature = await getSpot(spotcd);
    if (!feature) {
      return NextResponse.json(
        { error: "スポットが見つかりません" },
        { status: 404 },
      );
    }
    const [lng, lat] = feature.geometry.coordinates;
    const nearby = await getNearby(spotcd, lat, lng, 4);
    return NextResponse.json(
      { ...feature, nearby },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      },
    );
  } catch (error) {
    console.error("[/api/spots/:id]", error);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}
