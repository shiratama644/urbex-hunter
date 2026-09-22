import GhostMapApp from "@/components/GhostMapApp";
import { getFacets, querySpots } from "@/lib/spots-repo";

export const revalidate = 86400;

export default async function Page() {
  const [spotsRes, facetsRes] = await Promise.allSettled([querySpots({ limit: 500 }), getFacets()]);

  const collection =
    spotsRes.status === "fulfilled"
      ? spotsRes.value
      : { type: "FeatureCollection" as const, count: 0, truncated: false, features: [] };

  const facets =
    facetsRes.status === "fulfilled"
      ? facetsRes.value
      : { total: 0, genres: [], prefectures: [], phenomena: [] };

  // 失敗時はログしてフォールバック（500 にしない）
  if (spotsRes.status === "rejected") console.error("[page] querySpots failed", spotsRes.reason);
  if (facetsRes.status === "rejected") console.error("[page] getFacets failed", facetsRes.reason);

  return (
    <main className="h-dvh w-full">
      <h1 className="sr-only">全国心霊マップ Explorer — 日本全国の心霊スポットを地図で探す</h1>
      <GhostMapApp initialSpots={collection.features} facets={facets} />
    </main>
  );
}
