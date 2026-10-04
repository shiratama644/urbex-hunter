/**
 * KV 3-layer cache for D1 free tier — 87%削減事例 [1]
 * - Layer1: in-memory Map (0ms, isolate内)
 * - Layer2: Workers KV (global, <1ms hot) — 1k writes/day のため facets のみ対象
 * - Layer3: D1 + unstable_cache (3600s)
 * Free tier: KV reads 100k/day, writes 1k/day [2], D1 reads 5M/day [3] → 87%削減で 650k/day に
 * [1] https://zenn.dev/jphfa/articles/cloudflare-d1-three-tier-cache?locale=en
 * [2] https://developers.cloudflare.com/workers/platform/pricing/ (KV 100k reads, 1k writes)
 * [3] https://developers.cloudflare.com/d1/platform/pricing/ (D1 5M rows read)
 */

type KVNamespace = {
  get(key: string, opts?: unknown): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
};

const memCache = new Map<string, { at: number; data: unknown }>();
const MEM_TTL = 60_000; // 60s

function getKv(): KVNamespace | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cw = require("cloudflare:workers") as { env?: Record<string, unknown> };
    const kv = cw?.env?.KV as KVNamespace | undefined;
    if (kv) return kv;
  } catch {}
  // Wrangler dev の .dev.vars 経由は process.env では取得できないため undefined で fallback
  return undefined;
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const mem = memCache.get(key);
  if (mem && Date.now() - mem.at < MEM_TTL) return mem.data as T;

  const kv = getKv();
  if (!kv) return null;
  try {
    const raw = await kv.get(key, { type: "text" } as unknown as never);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T;
    memCache.set(key, { at: Date.now(), data: parsed });
    return parsed;
  } catch {
    return null;
  }
}

export async function kvPut<T>(key: string, value: T, ttlSec = 3600): Promise<void> {
  memCache.set(key, { at: Date.now(), data: value });
  const kv = getKv();
  if (!kv) return;
  try {
    // KV writes は 1k/day のため facets など低頻度のみで呼ぶこと
    await kv.put(key, JSON.stringify(value), { expirationTtl: ttlSec });
  } catch {}
}

// facets 専用: 1時間キャッシュだが free tier では 24h に延長可能
export const FACETS_KV_KEY = "urbex:facets:v2";
export const FACETS_TTL_SEC = 3600; // free tier では 86400 にすると D1 reads を 1/24 に削減、必要なら変更
