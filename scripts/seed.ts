/**
 * data/spots.geojson を PostgreSQL (Drizzle) へ取り込む。
 *   npx tsx scripts/seed.ts
 */
import "dotenv/config";
import { pool } from "../src/db";
import { importGeoJsonIntoDb } from "../src/lib/spots-repo";

async function main() {
  const count = await importGeoJsonIntoDb();
  console.log(`✅ ${count} 件のスポットを DB に取り込みました`);
  if (pool) await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
