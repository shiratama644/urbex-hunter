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
| `q` | string | フリーワード（名称 / 住所 / 概要 / コメントの部分一致） | `q=旧トンネル` |
| `limit` | number | 件数上限（既定 2000 相当 / page.tsx では `limit:2000`） | `limit=500` |

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

function parseBbox(raw: string | null): [number, number, number, number] | undefined {
  if (!raw) return undefined;
  const parts = raw.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return undefined;
  return [parts[0], parts[1], parts[2], parts[3]];
}
const multi = (raw: string | null): string[] | undefined => {
  if (!raw) return undefined;
  const values = raw.split(",").map((v) => v.trim()).filter(Boolean);
  return values.length ? values : undefined;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const collection = await querySpots({
    bbox: parseBbox(searchParams.get("bbox")),
    genre: multi(searchParams.get("genre")),
    pref: multi(searchParams.get("pref")),
    phenomenon: searchParams.get("phenomenon") ?? undefined,
    minRating: Number(searchParams.get("min_rating") ?? 0) || undefined,
    q: searchParams.get("q")?.trim() || undefined,
    limit: Number(searchParams.get("limit") ?? 0) || undefined,
  });
  return NextResponse.json(collection, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
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

- `GET /api/spots` と `page.tsx` は **1日1回再検証**（`revalidate = 86400`）。データ更新が週次のため十分。
- `Cache-Control` は `s-maxage=86400, stale-while-revalidate=604800`（1週間は stale を許容）。
- キャッシュ期間の変更は ADR で合意してから（CDN / ISR の挙動に影響するため）。

## エラー

- `bbox` パース失敗は `undefined` 扱いで全件側に倒す（400/500 にしない）。
- `querySpots` の例外は `console.error` + `500 { error: "スポットの取得に失敗しました" }`。
- DB 不在時は GeoJSON フォールバックで 200 を返す（500 にしない）。`ensureSeeded` のフォールバックを壊さない。
