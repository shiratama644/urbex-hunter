import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import { cache } from "react";
import * as schema from "./schema";

// D1 (Cloudflare Workers) — vinext / Workers ネイティブ最適化
// - 本番: `env.DB` binding (wrangler.jsonc d1_databases) [1](https://developers.cloudflare.com/workers/wrangler/configuration/#d1-databases)
// - ローカル: `wrangler d1 execute --local` / Miniflare で同じ binding
// - 未設定時: GeoJSON フォールバック（`src/data/spots.json`）
// - パフォーマンス: batch(単一RTT), prepared cache(50% parse削減) [2], PRAGMA optimize [3]
// [2] https://rxliuli.com/blog/journey-to-optimize-cloudflare-d1-database-queries/
// [3] https://developers.cloudflare.com/d1/best-practices/use-indexes/#run-pragma-optimize

// Minimal type for D1 — actual is from @cloudflare/workers-types, but `any` is enough for drizzle-orm/d1
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D1Database = any;

// ---------- binding 取得 (sync/async) ----------
// Workers では cloudflare:workers が最速 (0ms)、fallback は無しで D1 以外は GeoJSON
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
    // vitest / build 時は cloudflare:workers が alias mock (env:{}) → undefined
    bindingCache = undefined;
  }
  return undefined;
}

// vitest mock が alias されるため import も alias 解決される
async function getD1BindingAsyncInner(): Promise<D1Database | undefined> {
  if (bindingCache !== null) return bindingCache ?? undefined;
  try {
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

export function isDbConfiguredFn(): boolean {
  return !!getD1BindingSync();
}

export async function isDbConfiguredAsync(): Promise<boolean> {
  const db = await getD1BindingAsync();
  return !!db;
}

// 後方互換: import 時スナップショット (Workers ではリクエスト毎に再評価されるため hasDbAsync を使う)
export const isDbConfigured = !!getD1BindingSync();

// 後方互換: D1 では不要
export function getConnectionString(): string | undefined {
  return undefined;
}
export async function getConnectionStringAsync(): Promise<string | undefined> {
  return undefined;
}

// ---------- D1 drizzle — per-request cache ----------
// OpenNext 公式推奨 [4](https://opennext.js.org/cloudflare/howtos/db): cache(() => drizzle(env.MY_D1))
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

// 後方互換: `db` Proxy で遅延解決（既存 spots-repo が直接 import）
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

// ---------- 最適化 helpers ----------
// D1 は Workers と同ノードで実行されるが、HTTP 経由のため batch で RTT を 1/4 に削減 [2]
// drizzle D1 は .batch() を提供 [5](https://orm.drizzle.team/docs/perf-queries#batches)
export type D1BatchItem = ReturnType<ReturnType<typeof drizzleD1>["select"]>;

/**
 * フォールバック判定を一度で済ませる — hasDbAsync() の 1回化で 2回の binding 取得を削減
 */
export async function hasDbFast(): Promise<boolean> {
  if (bindingCache !== null) return !!bindingCache;
  return await isDbConfiguredAsync();
}

/**
 * リトライ: D1 は SQLITE_BUSY で 5s 待機が推奨 [6](https://developers.cloudflare.com/d1/best-practices/retry-queries/)
 * drizzle は自動リトライしないため、呼び出し側で hasDbFast + retry を行う
 */
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

// ローカル dev.db 用 PRAGMA 最適化 (libsql / better-sqlite3 共通)
// D1 本番では PRAGMA journal_mode 等は管理されるが、foreign_keys と optimize は有効 [3]
export const LOCAL_PRAGMAS = [
  "PRAGMA journal_mode=WAL", // 同時読取 10x [7](https://oneuptime.com/blog/post/2026-03-02-how-to-optimize-sqlite-performance-on-ubuntu/view)
  "PRAGMA synchronous=NORMAL", // fsync 2x 高速、WAL と併用で安全 [7]
  "PRAGMA cache_size=-64000", // 64MB page cache [2]
  "PRAGMA temp_store=MEMORY", // 一時表を RAM [7]
  "PRAGMA mmap_size=268435456", // 256MB mmap で read 2-3x [2]
  "PRAGMA busy_timeout=5000", // ロック 5s 待機 [3]
  "PRAGMA foreign_keys=ON",
] as const;
