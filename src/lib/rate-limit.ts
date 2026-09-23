type Entry = { count: number; reset: number };

const store = new Map<string, Entry>();

/**
 * 簡易メモリ rate-limit（事実: 60 req/min / IP の雛形）
 * - Serverless ではインスタンスごとに別だが、DoS の簡易緩和として有効
 * - テスト時は `NODE_ENV=test` で無効化できるようにする
 */
export function rateLimit(
  key: string,
  limit = 60,
  windowMs = 60_000
): {
  ok: boolean;
  remaining: number;
  reset: number;
} {
  const now = Date.now();
  const cur = store.get(key);
  if (!cur || now > cur.reset) {
    const reset = now + windowMs;
    store.set(key, { count: 1, reset });
    return { ok: true, remaining: limit - 1, reset };
  }
  if (cur.count >= limit) {
    return { ok: false, remaining: 0, reset: cur.reset };
  }
  cur.count += 1;
  return { ok: true, remaining: limit - cur.count, reset: cur.reset };
}

export function __clearRateLimit() {
  store.clear();
}

export function getClientIp(request: Request): string {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() ?? "unknown";
  const xr = request.headers.get("x-real-ip");
  if (xr) return xr.trim();
  return "unknown";
}
