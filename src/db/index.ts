import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import { cache } from "react";
import * as schema from "./schema";

// D1 (Cloudflare Workers) — vinext / Workers ネイティブ
// - 本番: `env.DB` binding (wrangler.jsonc d1_databases) [1](https://developers.cloudflare.com/workers/wrangler/configuration/#d1-databases)
// - ローカル: `wrangler d1 execute --local` または `vite dev` の Miniflare で同じ binding が提供される
// - 未設定時: GeoJSON フォールバック（`src/data/spots.json`）
// vinext では `cloudflare:workers` から env を取得するのが推奨だが、OpenNext互換の `getCloudflareContext` も try
// vitest / build 時は binding が無いため常にフォールバック

// Minimal type for D1 — actual is from @cloudflare/workers-types, but `any` is enough for drizzle-orm/d1
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D1Database = any;

function getD1BindingSync(): D1Database | undefined {
  // vinext / Workers: cloudflare:workers (wrangler.jsonc d1_databases binding: DB)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cw = require("cloudflare:workers") as { env?: Record<string, unknown> };
    const db = cw?.env?.DB as D1Database | undefined;
    if (db) return db;
  } catch {}
  return undefined;
}

async function getD1BindingAsyncInner(): Promise<D1Database | undefined> {
  try {
    const cw = (await import("cloudflare:workers")) as unknown as { env: Record<string, unknown> };
    const db = (cw as unknown as { env: { DB?: D1Database } }).env?.DB;
    if (db) return db;
  } catch {}
  return undefined;
}

export function getD1Binding(): D1Database | undefined {
  return getD1BindingSync();
}

export async function getD1BindingAsync(): Promise<D1Database | undefined> {
  return getD1BindingAsyncInner();
}

export function isDbConfiguredFn(): boolean {
  return !!getD1BindingSync();
}

export async function isDbConfiguredAsync(): Promise<boolean> {
  const db = await getD1BindingAsync();
  return !!db;
}

// 後方互換: 既存コードが `isDbConfigured` を boolean として参照しているため、
// import時のスナップショットを提供（vitestでは false、Workersではリクエスト時に再評価）
export const isDbConfigured = !!getD1BindingSync();

// 後方互換: `getConnectionString` は D1では不要だが、呼び出し元が参照するためダミー
export function getConnectionString(): string | undefined {
  return undefined;
}
export async function getConnectionStringAsync(): Promise<string | undefined> {
  return undefined;
}

// D1 drizzle — per-request（Workersではコネクションを再利用しない）
// OpenNext公式は `cache(() => drizzle(env.MY_D1))` を推奨 [2](https://opennext.js.org/cloudflare/howtos/db)

export const getDb = cache(() => {
  const d1 = getD1BindingSync();
  if (!d1) throw new Error("D1 binding DB is not configured — use GeoJSON fallback");
  return drizzleD1(d1 as unknown as D1Database, { schema });
});

export const getDbAsync = cache(async () => {
  const d1 = await getD1BindingAsync();
  if (!d1) throw new Error("D1 binding DB is not configured — use GeoJSON fallback");
  return drizzleD1(d1 as unknown as D1Database, { schema });
});

// 後方互換: `db` を Proxy で遅延解決（既存 `spots-repo` が `db` を直接 import しているため）
// 実際は `getDb()` / `getDbAsync()` を使うのが正しいが、Proxyで初回アクセス時に解決する
export const db: ReturnType<typeof drizzleD1> = new Proxy({} as ReturnType<typeof drizzleD1>, {
  get(_target, prop) {
    const d1 = getD1BindingSync();
    if (!d1) {
      throw new Error(
        "D1 binding DB is not configured — use GeoJSON fallback (isDbConfigured === false)"
      );
    }
    const real = getDb();
    const val = (real as unknown as Record<string | symbol, unknown>)[prop];
    return typeof val === "function" ? (val as (...a: unknown[]) => unknown).bind(real) : val;
  },
}) as ReturnType<typeof drizzleD1>;

export const poolOrNull = null;
export const pool = null;
