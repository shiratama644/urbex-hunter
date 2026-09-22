import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

// DATABASE_URL が無い環境（Sandbox / ビルド時 / ローカル GeoJSON フォールバック）では
// import 時に throw せず、遅延的に null を扱う。spots-repo 側で isDbConfigured を見て
// GeoJSON フォールバックに切り替える。
export const isDbConfigured = !!databaseUrl;

const globalForDb = globalThis as typeof globalThis & {
  __urbexHunterPool?: Pool;
  __urbexHunterDb?: ReturnType<typeof drizzle>;
};

let pool: Pool | null = null;
let dbInstance: ReturnType<typeof drizzle> | null = null;

if (isDbConfigured) {
  pool =
    globalForDb.__urbexHunterPool ??
    new Pool({
      connectionString: databaseUrl!,
    });
  if (process.env.NODE_ENV !== "production") {
    globalForDb.__urbexHunterPool = pool;
  }
  dbInstance =
    globalForDb.__urbexHunterDb ?? drizzle(pool);
  if (process.env.NODE_ENV !== "production") {
    globalForDb.__urbexHunterDb = dbInstance;
  }
}

// db が無い環境で import だけされた場合に throw しないよう Proxy で遅延エラーにする。
// spots-repo 側は isDbConfigured を見て分岐するため、通常はこの Proxy に到達しない。
export const poolOrNull = pool;

export const db: ReturnType<typeof drizzle> = dbInstance
  ? dbInstance
  : (new Proxy(
      {},
      {
        get() {
          throw new Error(
            "DATABASE_URL is not configured — use GeoJSON fallback (isDbConfigured === false)",
          );
        },
      },
    ) as ReturnType<typeof drizzle>);

// 後方互換: 旧 `pool` エクスポート（存在しない場合は null）
export { pool };
