"use client";

import L from "leaflet";
import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, useMap, useMapEvents, ZoomControl } from "react-leaflet";
import "leaflet.markercluster";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import type { Bbox } from "@/lib/bbox";
import { fearTone, genreEmoji, type SpotFeature } from "@/lib/types";

type Props = {
  spots: SpotFeature[];
  selectedId: number | null;
  onSelect: (spot: SpotFeature) => void;
  onBoundsChange: (bbox: Bbox, zoom: number) => void;
  flyTarget: { lat: number; lng: number; zoom?: number; key: number } | null;
  userPosition: { lat: number; lng: number } | null;
  tile: "dark" | "light";
};

const TILES = {
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a> / データ: <a href="https://ghostmap.jp/">全国心霊マップ</a>',
  },
  light: {
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a> / データ: <a href="https://ghostmap.jp/">全国心霊マップ</a>',
  },
} as const;

function pinIcon(spot: SpotFeature, selected: boolean) {
  const tone = fearTone(spot.properties.fearRating);
  return L.divIcon({
    className: `ghost-pin${selected ? " ghost-pin-selected" : ""}`,
    html: `<div class="ghost-pin-inner" style="background:${tone.bg};color:${tone.fg}"><span>${genreEmoji(
      spot.properties.genre
    )}</span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
  });
}

function clusterIcon(count: number, tone?: ReturnType<typeof fearTone>) {
  const size = count < 10 ? 40 : count < 50 ? 48 : count < 200 ? 58 : 68;
  const bg = tone
    ? `radial-gradient(circle at 30% 25%, ${tone.bg} 0%, ${tone.bg} 70%, ${tone.fg}22 100%)`
    : "radial-gradient(circle at 30% 25%, #eaddff 0%, #d0bcff 55%, #b69df8 100%)";
  const fg = tone?.fg ?? "#2a1145";
  const ring = tone ? `0 0 0 8px ${tone.bg}33` : "0 0 0 8px rgb(208 188 255 / 0.18)";
  return L.divIcon({
    className: "ghost-cluster",
    html: `<div class="ghost-cluster-inner" style="width:${size}px;height:${size}px;font-size:${size / 3.2}px;background:${bg};color:${fg};box-shadow:${ring},0 6px 16px rgb(0 0 0 / 0.5)">${count}</div>`,
    iconSize: L.point(size, size),
  });
}

function clusterTone(markers: L.Marker[]): ReturnType<typeof fearTone> | undefined {
  if (markers.length === 0 || markers.length > 200) return undefined;
  let sum = 0;
  let n = 0;
  for (const m of markers) {
    const spot = (m as unknown as { _ghostSpot?: SpotFeature })._ghostSpot;
    const r = spot?.properties.fearRating;
    if (typeof r === "number" && Number.isFinite(r) && r > 0) {
      sum += r;
      n += 1;
    }
  }
  if (n === 0) return fearTone(null);
  return fearTone(sum / n);
}

function ClusterLayer({
  spots,
  selectedId,
  onSelect,
}: Pick<Props, "spots" | "selectedId" | "onSelect">) {
  const map = useMap();
  const groupRef = useRef<L.MarkerClusterGroup | null>(null);
  const markersRef = useRef<Map<number, L.Marker>>(new Map());
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const group = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 62,
      spiderfyOnMaxZoom: true,
      disableClusteringAtZoom: 15,
      chunkedLoading: true,
      chunkInterval: 100,
      chunkDelay: 50,
      iconCreateFunction: (cluster) => {
        const c = cluster as unknown as {
          getChildCount: () => number;
          getAllChildMarkers: () => L.Marker[];
        };
        const count = c.getChildCount();
        // 大クラスタ（>200）は平均計算をスキップして既定色（パフォーマンス配慮）
        if (count > 200) return clusterIcon(count);
        try {
          const tone = clusterTone(c.getAllChildMarkers());
          return clusterIcon(count, tone);
        } catch {
          return clusterIcon(count);
        }
      },
    });
    groupRef.current = group;
    map.addLayer(group);
    return () => {
      map.removeLayer(group);
      groupRef.current = null;
    };
  }, [map]);

  // 差分更新（全再構築しない）— 1500件の jank を緩和（事実: clearLayers + addLayers batch が推奨）[2](https://www.xjavascript.com/blog/how-to-clear-leaflet-map-of-all-markers-and-layers-before-adding-new-ones/)
  // biome-ignore lint/correctness/useExhaustiveDependencies: selectedId は icon 更新のみで再構築しない — 別 useEffect で setIcon する
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    const nextIds = new Set(spots.map((s) => s.properties.spotcd));
    const prevIds = new Set(markersRef.current.keys());

    // 削除されたマーカーを除去
    for (const id of prevIds) {
      if (!nextIds.has(id)) {
        const m = markersRef.current.get(id);
        if (m) group.removeLayer(m);
        markersRef.current.delete(id);
      }
    }

    // 追加されたマーカーのみ生成（既存は再利用）
    const toAdd: L.Marker[] = [];
    for (const spot of spots) {
      if (!markersRef.current.has(spot.properties.spotcd)) {
        const [lng, lat] = spot.geometry.coordinates;
        const marker = L.marker([lat, lng], {
          icon: pinIcon(spot, spot.properties.spotcd === selectedId),
          title: spot.properties.name,
          riseOnHover: true,
        });
        (marker as unknown as { _ghostSpot: SpotFeature })._ghostSpot = spot;
        marker.on("click", () => onSelectRef.current(spot));
        markersRef.current.set(spot.properties.spotcd, marker);
        toAdd.push(marker);
      }
    }
    if (toAdd.length) group.addLayers(toAdd);

    // 初回等で空の場合は chunkedLoading が効くよう addLayers をバッチで
    // （既存の全件が prev に無い場合は toAdd が spots 全体になるので自然に全件追加）
  }, [spots]);

  useEffect(() => {
    for (const spot of spots) {
      const marker = markersRef.current.get(spot.properties.spotcd);
      marker?.setIcon(pinIcon(spot, spot.properties.spotcd === selectedId));
    }
  }, [selectedId, spots]);

  return null;
}

function BoundsReporter({ onBoundsChange }: Pick<Props, "onBoundsChange">) {
  const report = (map: L.Map) => {
    const b = map.getBounds();
    onBoundsChange([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], map.getZoom());
  };
  const map = useMapEvents({
    moveend: () => report(map),
    zoomend: () => report(map),
  });
  return null;
}

function FlyController({ flyTarget }: Pick<Props, "flyTarget">) {
  const map = useMap();
  useEffect(() => {
    if (!flyTarget) return;
    map.flyTo([flyTarget.lat, flyTarget.lng], flyTarget.zoom ?? 14, {
      duration: 1.1,
      easeLinearity: 0.2,
    });
  }, [flyTarget, map]);
  return null;
}

function UserMarker({ userPosition }: Pick<Props, "userPosition">) {
  const map = useMap();
  const userIcon = useMemo(
    () =>
      L.divIcon({
        className: "ghost-pin",
        html: `<div style="width:18px;height:18px;border-radius:999px;background:#7fd8c4;box-shadow:0 0 0 6px rgba(127,216,196,.25),0 0 14px rgba(127,216,196,.8)"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
    []
  );
  useEffect(() => {
    if (!userPosition) return;
    const marker = L.marker([userPosition.lat, userPosition.lng], {
      icon: userIcon,
      interactive: false,
      zIndexOffset: 1000,
    }).addTo(map);
    return () => {
      map.removeLayer(marker);
    };
  }, [userPosition, map, userIcon]);
  return null;
}

export default function MapClient({
  spots,
  selectedId,
  onSelect,
  onBoundsChange,
  flyTarget,
  userPosition,
  tile,
}: Props) {
  const tileConf = useMemo(() => TILES[tile], [tile]);

  return (
    <MapContainer
      center={[36.2048, 138.2529]}
      zoom={5}
      minZoom={4}
      maxZoom={18}
      zoomControl={false}
      preferCanvas
      className="h-full w-full"
      worldCopyJump
    >
      <TileLayer
        key={tile}
        url={tileConf.url}
        attribution={tileConf.attribution}
        subdomains="abcd"
        maxZoom={19}
        detectRetina
      />
      <ClusterLayer spots={spots} selectedId={selectedId} onSelect={onSelect} />
      <BoundsReporter onBoundsChange={onBoundsChange} />
      <FlyController flyTarget={flyTarget} />
      <UserMarker userPosition={userPosition} />
      <ZoomControl position="bottomright" />
    </MapContainer>
  );
}
