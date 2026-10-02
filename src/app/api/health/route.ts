import { sql } from "drizzle-orm";
import { db, getConnectionStringAsync } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const hasDb = !!(await getConnectionStringAsync());
  if (!hasDb) {
    // DB 未設定環境（Sandbox / ビルド時）は GeoJSON フォールバックで正常扱い
    return Response.json({ ok: true, db: "geojson-fallback" });
  }
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
