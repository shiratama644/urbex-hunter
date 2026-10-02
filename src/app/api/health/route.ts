import { db, isDbConfiguredAsync } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const hasDb = await isDbConfiguredAsync();
  if (!hasDb) {
    // DB 未設定環境（Sandbox / ビルド時）は GeoJSON フォールバックで正常扱い
    return Response.json({ ok: true, db: "geojson-fallback" });
  }
  try {
    await db
      .select()
      .from((await import("@/db/schema")).spots)
      .limit(1);
    return Response.json({ ok: true, db: "d1" });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
