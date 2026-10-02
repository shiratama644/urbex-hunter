import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// Hyperdrive対応: `wrangler hyperdrive create` で生成した Hyperdrive binding は
// `env.HYPERDRIVE.connectionString` で取得するのが公式推奨 [1](https://developers.cloudflare.com/workers/databases/third-party-integrations/neon/)
// OpenNextでは `getCloudflareContext().env.HYPERDRIVE` でアクセス [2](https://opennext.js.org/cloudflare/howtos/db)
// - ローカル: `process.env.DATABASE_URL` を使う（`.dev.vars` / `.env.local`）
// - Workers本番: Hyperdrive binding を優先し、未設定なら `DATABASE_URL` フォールバック
// - `pg@>=8.16.3` が必須 [1](https://developers.cloudflare.com/workers/databases/third-party-integrations/neon/)

// Note: `getCloudflareContext` は Workers外（vitest / next build）では throw する
// ため、取得は関数内で try/catch する。top-level import は安全（OpenNextがハンドル）。
import { getCloudflareContext } from "@opennextjs/cloudflare";

function getHyperdriveConnectionStringSync(): string | undefined {
  try {
    const ctx = getCloudflareContext();
    const env = ctx?.env as Record<string, unknown> | undefined;
    const hd = env?.HYPERDRIVE as { connectionString?: string } | undefined;
    if (hd?.connectionString) return hd.connectionString;
  } catch {
    // not in Workers context (vitest / build)
  }
  return undefined;
}

async function getHyperdriveConnectionStringAsync(): Promise<string | undefined> {
  try {
    const ctx = await getCloudflareContext({ async: true });
    const env = ctx?.env as Record<string, unknown> | undefined;
    const hd = env?.HYPERDRIVE as { connectionString?: string } | undefined;
    if (hd?.connectionString) return hd.connectionString;
  } catch {
    // ignore
  }
  return undefined;
}

function resolveConnectionStringSync(): string | undefined {
  return getHyperdriveConnectionStringSync() ?? process.env.DATABASE_URL;
}

async function resolveConnectionStringAsync(): Promise<string | undefined> {
  const hd = await getHyperdriveConnectionStringAsync();
  return hd ?? process.env.DATABASE_URL;
}

// ---- Public helpers ----
export function getConnectionString(): string | undefined {
  return resolveConnectionStringSync();
}

export async function getConnectionStringAsync(): Promise<string | undefined> {
  return resolveConnectionStringAsync();
}

export function isDbConfiguredFn(): boolean {
  return !!resolveConnectionStringSync();
}

export async function isDbConfiguredAsync(): Promise<boolean> {
  const cs = await resolveConnectionStringAsync();
  return !!cs;
}

// 後方互換: 既存コードは `isDbConfigured` を boolean として import しているため、
// import時のスナップショットを維持しつつ、ランタイムでは上記関数を併用する。
// テストでは `process.env.DATABASE_URL` を操作して GeoJSON フォールバックを検証するため、
// この boolean は `DATABASE_URL` の有無と同期する（Hyperdriveはランタイムで追加チェック）。
const databaseUrlAtImport = process.env.DATABASE_URL;
export const isDbConfigured = !!databaseUrlAtImport || !!getHyperdriveConnectionStringSync();

// ---- Pool / Drizzle ----
const globalForDb = globalThis as typeof globalThis & {
  __urbexHunterPool?: Pool;
  __urbexHunterDb?: ReturnType<typeof drizzle>;
};

let pool: Pool | null = null;
let dbInstance: ReturnType<typeof drizzle> | null = null;

function createPool(cs: string): Pool {
  // Hyperdriveではリクエストごとに新規Poolを作成し `maxUses: 1` が推奨 [2](https://opennext.js.org/cloudflare/howtos/db)
  // Node（ローカル）では再利用してコネクションを節約
  const isHyperdrive = (() => {
    try {
      const hd = getHyperdriveConnectionStringSync();
      return !!hd && hd === cs;
    } catch {
      return false;
    }
  })();
  if (isHyperdrive) {
    return new Pool({ connectionString: cs, maxUses: 1 } as unknown as ConstructorParameters<
      typeof Pool
    >[0]);
  }
  return new Pool({ connectionString: cs });
}

function getOrCreatePool(cs: string): Pool {
  if (pool) return pool;
  // ローカル/Node では singleton を再利用（HMR対応）
  const p = createPool(cs);
  pool = p;
  if (process.env.NODE_ENV !== "production") {
    globalForDb.__urbexHunterPool = p;
  }
  return p;
}

const initialCs = resolveConnectionStringSync();
if (initialCs) {
  const gPool = globalForDb.__urbexHunterPool;
  pool = gPool ?? getOrCreatePool(initialCs);
  if (process.env.NODE_ENV !== "production") {
    globalForDb.__urbexHunterPool = pool;
  }
  const gDb = globalForDb.__urbexHunterDb;
  dbInstance = gDb ?? drizzle(pool);
  if (process.env.NODE_ENV !== "production") {
    globalForDb.__urbexHunterDb = dbInstance;
  }
}

// Hyperdrive の場合はリクエストごとに新規Poolを作成するため、`getDb()` を使うのが理想
// 既存コード互換のため `db` も維持するが、Hyperdrive環境では遅延的に再解決する
export function getDb(): ReturnType<typeof drizzle> {
  const cs = resolveConnectionStringSync();
  if (!cs) {
    throw new Error(
      "DATABASE_URL is not configured — use GeoJSON fallback (isDbConfigured === false)"
    );
  }
  // Hyperdriveなら毎回新規Pool（maxUses:1）、Nodeなら singleton
  const isHyperdrive = !!getHyperdriveConnectionStringSync();
  if (isHyperdrive) {
    const p = new Pool({ connectionString: cs, maxUses: 1 } as unknown as ConstructorParameters<
      typeof Pool
    >[0]);
    return drizzle(p);
  }
  if (dbInstance) return dbInstance;
  const p = getOrCreatePool(cs);
  dbInstance = drizzle(p);
  return dbInstance;
}

export async function getDbAsync(): Promise<ReturnType<typeof drizzle>> {
  const cs = await resolveConnectionStringAsync();
  if (!cs) {
    throw new Error(
      "DATABASE_URL is not configured — use GeoJSON fallback (isDbConfigured === false)"
    );
  }
  const hd = await getHyperdriveConnectionStringAsync();
  const isHyperdrive = !!hd;
  if (isHyperdrive) {
    const p = new Pool({ connectionString: cs, maxUses: 1 } as unknown as ConstructorParameters<
      typeof Pool
    >[0]);
    return drizzle(p);
  }
  if (dbInstance) return dbInstance;
  const p = getOrCreatePool(cs);
  dbInstance = drizzle(p);
  return dbInstance;
}

// 後方互換: 既存の `db` import はそのまま動作（Hyperdriveでも初回は singleton を返すが、
// リクエストごとに `getDb()` を呼ぶ方が正しい。`spots-repo` は `getConnectionString()` で分岐済み）
export const poolOrNull = pool;

export const db: ReturnType<typeof drizzle> = dbInstance
  ? dbInstance
  : (new Proxy(
      {},
      {
        get(_target, prop) {
          // 遅延解決: 初回アクセス時に Hyperdrive / DATABASE_URL を再評価
          const cs = resolveConnectionStringSync();
          if (cs) {
            const target = getDb();
            const val = (target as unknown as Record<string | symbol, unknown>)[prop];
            return typeof val === "function"
              ? (val as (...a: unknown[]) => unknown).bind(target)
              : val;
          }
          throw new Error(
            "DATABASE_URL is not configured — use GeoJSON fallback (isDbConfigured === false)"
          );
        },
      }
    ) as ReturnType<typeof drizzle>);

// 後方互換: 旧 `pool` エクスポート
export { pool };
