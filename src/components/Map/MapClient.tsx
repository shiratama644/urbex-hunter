"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  ZoomControl,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet.markercluster";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import { fearTone, genreEmoji, type SpotFeature } from "@/lib/types";

export type Bbox = [number, number, number, number];

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
      spot.properties.genre,
    )}</span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
  });
}

function clusterIcon(count: number) {
  const size = count < 10 ? 40 : count < 50 ? 48 : count < 200 ? 58 : 68;
  return L.divIcon({
    className: "ghost-cluster",
    html: `<div class="ghost-cluster-inner" style="width:${size}px;height:${size}px;font-size:${
      size / 3.2
    }px">${count}</div>`,
    iconSize: L.point(size, size),
  });
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
      iconCreateFunction: (cluster) => clusterIcon(cluster.getChildCount()),
    });
    groupRef.current = group;
    map.addLayer(group);
    return () => {
      map.removeLayer(group);
      groupRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.clearLayers();
    markersRef.current.clear();
    const markers = spots.map((spot) => {
      const [lng, lat] = spot.geometry.coordinates;
      const marker = L.marker([lat, lng], {
        icon: pinIcon(spot, spot.properties.spotcd === selectedId),
        title: spot.properties.name,
        riseOnHover: true,
      });
      marker.on("click", () => onSelectRef.current(spot));
      markersRef.current.set(spot.properties.spotcd, marker);
      return marker;
    });
    group.addLayers(markers);
    // selectedId は icon 更新のみで再構築しない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spots]);

  useEffect(() => {
    for (const spot of spots) {
      const marker = markersRef.current.get(spot.properties.spotcd);
      marker?.setIcon(pinIcon(spot, spot.properties.spotcd === selectedId));
    }
  }, [selectedId, spots]);

  return null;
}

function BoundsReporter({
  onBoundsChange,
}: Pick<Props, "onBoundsChange">) {
  const report = (map: L.Map) => {
    const b = map.getBounds();
    onBoundsChange(
      [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
      map.getZoom(),
    );
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
  useEffect(() => {
    if (!userPosition) return;
    const icon = L.divIcon({
      className: "ghost-pin",
      html: `<div style="width:18px;height:18px;border-radius:999px;background:#7fd8c4;box-shadow:0 0 0 6px rgba(127,216,196,.25),0 0 14px rgba(127,216,196,.8)"></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
    const marker = L.marker([userPosition.lat, userPosition.lng], {
      icon,
      interactive: false,
      zIndexOffset: 1000,
    }).addTo(map);
    return () => {
      map.removeLayer(marker);
    };
  }, [userPosition, map]);
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
      <ClusterLayer
        spots={spots}
        selectedId={selectedId}
        onSelect={onSelect}
      />
      <BoundsReporter onBoundsChange={onBoundsChange} />
      <FlyController flyTarget={flyTarget} />
      <UserMarker userPosition={userPosition} />
      <ZoomControl position="bottomright" />
    </MapContainer>
  );
}
