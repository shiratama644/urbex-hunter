import GhostMapApp from "@/components/GhostMapApp";
import { getFacets, querySpots } from "@/lib/spots-repo";

export const revalidate = 86400;

export default async function Page() {
  const [collection, facets] = await Promise.all([querySpots({ limit: 2000 }), getFacets()]);

  return (
    <main className="h-dvh w-full">
      <h1 className="sr-only">全国心霊マップ Explorer — 日本全国の心霊スポットを地図で探す</h1>
      <GhostMapApp initialSpots={collection.features} facets={facets} />
    </main>
  );
}
