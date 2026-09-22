import { NextResponse } from "next/server";
import { querySpots } from "@/lib/spots-repo";

// 1日1回の再検証（スクレイピングは週次のため十分）
export const revalidate = 86400;

function parseBbox(raw: string | null): [number, number, number, number] | undefined {
  if (!raw) return undefined;
  const parts = raw.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return undefined;
  return [parts[0], parts[1], parts[2], parts[3]];
}

const multi = (raw: string | null): string[] | undefined => {
  if (!raw) return undefined;
  const values = raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  return values.length ? values : undefined;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  try {
    const collection = await querySpots({
      bbox: parseBbox(searchParams.get("bbox")),
      genre: multi(searchParams.get("genre")),
      pref: multi(searchParams.get("pref")),
      phenomenon: searchParams.get("phenomenon") ?? undefined,
      minRating: Number(searchParams.get("min_rating") ?? 0) || undefined,
      q: searchParams.get("q")?.trim() || undefined,
      limit: Number(searchParams.get("limit") ?? 0) || undefined,
    });

    return NextResponse.json(collection, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch (error) {
    console.error("[/api/spots]", error);
    return NextResponse.json(
      { error: "スポットの取得に失敗しました" },
      { status: 500 },
    );
  }
}
