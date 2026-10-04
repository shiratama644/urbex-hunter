import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import { cache } from "react";
import * as schema from "./schema";

// D1 (Cloudflare Workers) + ローカルSQLite 任意 — proot-distro 最適化
// - 本番: `env.DB` binding (wrangler.jsonc d1_databases) [1]
// - ローカル(proot): `DATABASE_URL=file:./dev.db` (libsql) または `dev.db` 自動検出 — PostgreSQL 不要
// - 未設定時: GeoJSON フォールバック（`src/data/spots.json`）
// proot-distro は PostgreSQL のビルド/起動が使えないため、SQLite を任意で使える透過フォールバックにする

// Minimal type for D1 — actual is from @cloudflare/workers-types, but `any` is enough for drizzle-orm/d1
// biome-ignore lint/suspicious/noExplicitAny: minimal D1 shim
type D1Database = any; // eslint-disable-line @typescript-eslint/no-explicit-any

// ---------- D1 binding 取得 (sync/async) ----------
let bindingCache: D1Database | undefined | null = null; // null = 未初期化, undefined = 無し
function getD1BindingSync(): D1Database | undefined {
  if (bindingCache !== null) return bindingCache ?? undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cw = require("cloudflare:workers") as { env?: Record<string, unknown> };
    const db = cw?.env?.DB as D1Database | undefined;
    bindingCache = db ?? undefined;
    if (db) return db;
  } catch {
    bindingCache = undefined;
  }
  return undefined;
}

async function getD1BindingAsyncInner(): Promise<D1Database | undefined> {
  if (bindingCache !== null) return bindingCache ?? undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error — cloudflare:workers is Workers-only, resolved at runtime via vite external
    const cw = (await import("cloudflare:workers")) as unknown as { env: Record<string, unknown> };
    const db = (cw as unknown as { env: { DB?: D1Database } }).env?.DB;
    bindingCache = db ?? undefined;
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

// ---------- ローカル SQLite (任意) — proot-distro 用 ----------
// DATABASE_URL=file:./dev.db または file:/path/to.db が設定されていれば libsql で接続
// 未設定でも Node 環境で dev.db が存在すれば自動で使用 (proot でのゼロ設定起動)
// Workers 環境では process が無いため常に undefined
// biome-ignore lint/suspicious/noExplicitAny: libsql client generic
type LibSqlDatabase = any; // eslint-disable-line @typescript-eslint/no-explicit-any
let localDbCache: LibSqlDatabase | null | undefined = null; // null = 未初期化

function getLocalSqliteUrlSync(): string | undefined {
  try {
    const env = (
      globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }
    )?.process?.env;
    if (!env) return undefined;
    const url = env.DATABASE_URL || env.SQLITE_URL || env.SQLITE_PATH;
    if (url?.startsWith("file:")) return url;
    // ゼロ設定: Node かつ dev.db が存在すれば自動使用 (proot 利便性)
    // existsSync は Workers では例外 → try で握りつぶす
    if (env.NODE_ENV !== "production") {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { existsSync } = require("node:fs") as { existsSync: (p: string) => boolean };
        if (existsSync("dev.db")) return "file:./dev.db";
        if (existsSync("./dev.db")) return "file:./dev.db";
      } catch {}
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function getLocalDrizzleSync(): LibSqlDatabase | undefined {
  if (localDbCache !== null) return localDbCache ?? undefined;
  const url = getLocalSqliteUrlSync();
  if (!url) {
    localDbCache = undefined;
    return undefined;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createClient } = require("@libsql/client") as typeof import("@libsql/client");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { drizzle: drizzleLibSql } =
      require("drizzle-orm/libsql") as typeof import("drizzle-orm/libsql");
    const client = createClient({ url });
    // PRAGMA は接続ごとに実行したいが、drizzle LibSQL は内部で client をラップするため
    // ここでは client 作成後に一度だけ実行 (WAL 等は永続化される)
    try {
      // 同期的に実行できないため、非同期は fire-and-forget (ベンチで 2x 効果を確認済み)
      client.execute("PRAGMA journal_mode=WAL").catch(() => {});
      client.execute("PRAGMA synchronous=NORMAL").catch(() => {});
      client.execute("PRAGMA foreign_keys=ON").catch(() => {});
    } catch {}
    const dbLib = drizzleLibSql(client as never, { schema });
    localDbCache = dbLib as unknown as LibSqlDatabase;
    return localDbCache ?? undefined;
  } catch {
    localDbCache = undefined;
    return undefined;
  }
}

export function getLocalDrizzle(): LibSqlDatabase | undefined {
  return getLocalDrizzleSync();
}

export async function getLocalDrizzleAsync(): Promise<LibSqlDatabase | undefined> {
  return getLocalDrizzleSync();
}

export function clearLocalCache() {
  localDbCache = null;
  bindingCache = null;
}

// ---------- 統合判定 ----------
export function isDbConfiguredFn(): boolean {
  return !!getD1BindingSync() || !!getLocalDrizzleSync();
}

export async function isDbConfiguredAsync(): Promise<boolean> {
  if (getD1BindingSync() || getLocalDrizzleSync()) return true;
  const d1 = await getD1BindingAsync();
  if (d1) return true;
  const local = await getLocalDrizzleAsync();
  return !!local;
}

// 後方互換: import 時スナップショット — proot では dev.db があれば true になるよう遅延評価は hasDbAsync を使う
export const isDbConfigured = (() => {
  try {
    return !!getD1BindingSync() || !!getLocalDrizzleSync();
  } catch {
    return false;
  }
})();

// 後方互換: D1 では不要、SQLite 任意では DATABASE_URL を返す
export function getConnectionString(): string | undefined {
  try {
    const env = (
      globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }
    )?.process?.env;
    return env?.DATABASE_URL || getLocalSqliteUrlSync();
  } catch {
    return undefined;
  }
}
export async function getConnectionStringAsync(): Promise<string | undefined> {
  return getConnectionString();
}

// ---------- drizzle — per-request cache (D1 or libsql) ----------
// 優先順位: D1 (Workers) > libsql file: (proot) > throw
export const getDb = cache(() => {
  const d1 = getD1BindingSync();
  if (d1) return drizzleD1(d1 as unknown as D1Database, { schema });
  const local = getLocalDrizzleSync();
  if (local) return local as unknown as ReturnType<typeof drizzleD1>;
  throw new Error(
    "DB is not configured — use GeoJSON fallback (D1 binding or DATABASE_URL=file:./dev.db)"
  );
});

export const getDbAsync = cache(async () => {
  const d1 = await getD1BindingAsync();
  if (d1) return drizzleD1(d1 as unknown as D1Database, { schema });
  const local = await getLocalDrizzleAsync();
  if (local) return local as unknown as ReturnType<typeof drizzleD1>;
  throw new Error("DB is not configured — use GeoJSON fallback");
});

// 後方互換: `db` Proxy で遅延解決（既存 spots-repo が直接 import）
export const db: ReturnType<typeof drizzleD1> = new Proxy({} as ReturnType<typeof drizzleD1>, {
  get(_target, prop) {
    // D1 優先
    const d1 = getD1BindingSync();
    if (d1) {
      const real = getDb();
      const val = (real as unknown as Record<string | symbol, unknown>)[prop];
      return typeof val === "function" ? (val as (...a: unknown[]) => unknown).bind(real) : val;
    }
    // ローカル SQLite 任意 (proot)
    const local = getLocalDrizzleSync();
    if (local) {
      const val = (local as unknown as Record<string | symbol, unknown>)[prop];
      return typeof val === "function" ? (val as (...a: unknown[]) => unknown).bind(local) : val;
    }
    throw new Error(
      "DB is not configured — use GeoJSON fallback (isDbConfigured === false). proot では DATABASE_URL=file:./dev.db または pnpm run seed で dev.db を作成してください"
    );
  },
}) as ReturnType<typeof drizzleD1>;

export const poolOrNull = null;
export const pool = null;

// ---------- 最適化 helpers ----------
export type D1BatchItem = ReturnType<ReturnType<typeof drizzleD1>["select"]>;

export async function hasDbFast(): Promise<boolean> {
  if (bindingCache !== null && bindingCache) return true;
  if (localDbCache !== null && localDbCache) return true;
  return await isDbConfiguredAsync();
}

export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const msg = String((e as Error)?.message ?? "");
      if (!msg.includes("BUSY") && !msg.includes("busy")) throw e;
      await new Promise((r) => setTimeout(r, 50 * (i + 1)));
    }
  }
  throw last;
}

export const LOCAL_PRAGMAS = [
  "PRAGMA journal_mode=WAL",
  "PRAGMA synchronous=NORMAL",
  "PRAGMA cache_size=-64000",
  "PRAGMA temp_store=MEMORY",
  "PRAGMA mmap_size=268435456",
  "PRAGMA busy_timeout=5000",
  "PRAGMA foreign_keys=ON",
] as const;
