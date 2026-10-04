# API — 契約・クエリ・キャッシュ

## エンドポイント一覧

| Endpoint | Method | 説明 | キャッシュ |
|---|---|---|---|
| `/api/spots` | GET | スポット一覧（GeoJSON FeatureCollection）。クエリで絞り込み | `revalidate = 86400` + `Cache-Control: public, s-maxage=86400, stale-while-revalidate=604800` |
| `/api/spots/[id]` | GET | スポット詳細 + 近隣4件（`spotcd` 指定） | 個別キャッシュ（将来 `revalidate` 追加時は ADR） |
| `/api/facets` | GET | ジャンル・都道府県・心霊現象の件数集計（フィルタUI用） | `revalidate = 86400` 想定（実装は `spots-repo.getFacets`） |
| `/api/health` | GET | ヘルスチェック | no-cache |

## GET /api/spots

### クエリ

| パラメータ | 型 | 説明 | 例 |
|---|---|---|---|
| `bbox` | `minLng,minLat,maxLng,maxLat` (CSV) | 地図表示範囲で絞り込み。失敗時は全件側に倒す（500 にしない） | `bbox=139.5,35.5,140.0,36.0` |
| `genre` | CSV | ジャンルの複数指定（カンマ区切り） | `genre=トンネル,住居` |
| `pref` | CSV | 都道府県の複数指定 | `pref=東京都,大阪府` |
| `phenomenon` | string | 心霊現象の部分一致 | `phenomenon=足音` |
| `min_rating` | number | 怖さ評価の下限 | `min_rating=3.5` |
| `q` | string | フリーワード（名称 / 住所 / 概要 / コメントの部分一致）。100文字で truncate、空は無視 | `q=旧トンネル` |
| `limit` | number | 件数上限（API 既定 1500 / 上限 3000 / 最小 1、NaN/負数は 1500 にフォールバック、page.tsx 初回は `limit:500`） | `limit=500` |

### レスポンス

```ts
type SpotCollection = {
  type: "FeatureCollection";
  count: number;
  truncated?: boolean;
  features: SpotFeature[];
}
// SpotFeature は src/lib/types.ts 参照（Point + SpotProperties）
```

- `bbox` 絞り込みは `GhostMapApp` が `zoom >= 8` の時のみ送る（広域でのちらつき・負荷対策）。
- `limit` 超過時は `truncated: true` を付与する想定（実装は `spots-repo.querySpots`）。

### 実装（正本: `src/app/api/spots/route.ts` + `src/lib/spots-repo.ts`）

```ts
export const revalidate = 86400;

// 事実: bbox は -180..180/-90..90 に clamp し逆転を正規化する（EM1-B）
export function parseBbox(raw: string | null): [number, number, number, number] | undefined {
  if (!raw) return undefined;
  const parts = raw.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return undefined;
  let [a, b, c, d] = parts;
  if (a > c) [a, c] = [c, a];
  if (b > d) [b, d] = [d, b];
  return [clamp(a,-180,180), clamp(b,-90,90), clamp(c,-180,180), clamp(d,-90,90)];
}
const multi = (raw: string | null): string[] | undefined => {
  if (!raw) return undefined;
  const values = raw.split(",").map((v) => v.trim()).filter(Boolean);
  return values.length ? values : undefined;
};
// q は 100文字で truncate, limit は 1..3000 に clamp
export function clampQ(raw: string | null): string | undefined { return raw?.trim().slice(0,100) || undefined; }
export function clampLimit(raw: string | null): number | undefined { const n=Number(raw); return Number.isFinite(n) && n>0 ? Math.max(1,Math.min(3000,Math.trunc(n))) : undefined; }

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const collection = await querySpots({
    bbox: parseBbox(searchParams.get("bbox")),
    genre: multi(searchParams.get("genre")),
    pref: multi(searchParams.get("pref")),
    phenomenon: searchParams.get("phenomenon")?.trim() || undefined,
    minRating: clampMinRating(searchParams.get("min_rating")),
    q: clampQ(searchParams.get("q")),
    limit: clampLimit(searchParams.get("limit")),
  });
  return NextResponse.json(collection, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800", "X-RateLimit-Limit": "60" },
  });
}
```

`querySpots` は `spots-repo.ts` で `and` / `ilike` / `inArray` / `gte` / `sql` を組み合わせて WHERE を構築する。`bbox` は `lat` / `lng` の範囲条件に分解する。

## GET /api/spots/[id]

`spotcd` で 1 件取得 + 近隣4件（距離順）。`src/app/api/spots/[id]/route.ts` が正本。

- 近隣は Haversine 等で距離計算し、同一 `spotcd` を除外して 4 件返す。
- 距離計算の変更はテストを伴うこと。

## GET /api/facets

フィルタUI用の集計。

```ts
type SpotFacets = {
  total: number;
  genres: { value: string; count: number }[];
  prefectures: { value: string; count: number }[];
  phenomena: { value: string; count: number }[];
}
```

`src/lib/spots-repo.ts` の `getFacets()` が `GROUP BY` 的な集計を行う。毎リクエストで `COUNT` するため、将来は ISR やメモ化を検討する（ADR が必要）。

## GET /api/health

死活監視用。DB 接続の有無を返す場合は `tableReady()` の結果を含める。

## キャッシュ戦略

- `GET /api/spots` と `page.tsx` は **1日1回再検証**（`revalidate = 86400`）。`GET /api/facets` と `getFacets()` は **1時間 cache**（`unstable_cache` + `tags: ['facets']` + `revalidate: 3600`）。`page.tsx` が両方を呼ぶため実効は 1h（最小 revalidate が勝つ事実 [1](https://nextjs.org/docs/app/guides/caching-without-cache-components)）。
- `Cache-Control` は `s-maxage=86400, stale-while-revalidate=604800`（1週間は stale を許容）。クライアントの `fetch` は `cache: 'no-store'` で CDN の stale を避ける（bbox 移動時の鮮度）。
- `readGeoJson` は `stat.mtimeMs + size` でメモ化し 5分以内の再読み込みを抑止（EM1-B）。
- キャッシュ期間の変更は ADR で合意してから（CDN / ISR の挙動に影響するため）。

## エラー / レート制限

- `bbox` パース失敗は `undefined` 扱いで全件側に倒す（400/500 にしない）。範囲超過は `-180..180` / `-90..90` に clamp（EM1-B）。
- `q` は 100文字で truncate、`limit` は 1..3000 に clamp、`min_rating` は 0..5 に clamp（EM1-B）。`page.tsx` は `Promise.allSettled` でフォールバックし 500 にしない。
- `querySpots` の例外は `console.error` + `500 { error: "スポットの取得に失敗しました" }`。
- DB 不在時は GeoJSON フォールバックで 200 を返す（500 にしない）。`ensureSeeded` のフォールバックを壊さない。
- `/api/spots` は `60 req/min/IP` のメモリ rate-limit（`X-RateLimit-*` + `429` + `Retry-After`）。Serverless ではインスタンスごとに別だが簡易 DoS 緩和として有効（EM1-B）。
