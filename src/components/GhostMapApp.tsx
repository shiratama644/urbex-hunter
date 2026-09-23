"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Ghost,
  Layers,
  Loader2,
  LocateFixed,
  Search,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DisclaimerDialog from "@/components/DisclaimerDialog";
import FilterPanel from "@/components/FilterPanel";
import SpotDetailSheet from "@/components/SpotDetailSheet";
import { type Bbox, clampBbox } from "@/lib/bbox";
import { genreEmoji, type SpotCollection, type SpotFacets, type SpotFeature } from "@/lib/types";

const MapClient = dynamic(() => import("@/components/Map/MapClient"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center bg-m3-surface-dim">
      <div className="flex flex-col items-center gap-3 text-m3-on-surface-variant">
        <Loader2 className="animate-spin text-m3-primary" size={28} />
        <p className="text-body-md">地図を召喚中...</p>
      </div>
    </div>
  ),
});

type Props = {
  initialSpots: SpotFeature[];
  facets: SpotFacets;
};

export default function GhostMapApp({ initialSpots, facets }: Props) {
  const [spots, setSpots] = useState<SpotFeature[]>(initialSpots);
  const [loadingSpots, setLoadingSpots] = useState(false);
  const [genres, setGenres] = useState<string[]>([]);
  const [prefs, setPrefs] = useState<string[]>([]);
  const [minRating, setMinRating] = useState(0);
  const [bbox, setBbox] = useState<Bbox | null>(null);
  const [zoom, setZoom] = useState(5);
  const [filterOpen, setFilterOpen] = useState(false);
  const [tile, setTile] = useState<"dark" | "light">("dark");

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SpotFeature[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const [selected, setSelected] = useState<SpotFeature | null>(null);
  const [nearby, setNearby] = useState<SpotFeature[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [flyTarget, setFlyTarget] = useState<{
    lat: number;
    lng: number;
    zoom?: number;
    key: number;
  } | null>(null);
  const [userPosition, setUserPosition] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  const fetchIdRef = useRef(0);
  const suggestRef = useRef<HTMLDivElement>(null);
  const detailAbortRef = useRef<AbortController | null>(null);

  const topGenres = useMemo(() => facets.genres.slice(0, 12), [facets.genres]);

  /* ---------------- フィルタ永続化（URLクエリ） ---------------- */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const g = params.get("genre");
    const p = params.get("pref");
    const r = params.get("min_rating");
    if (g) setGenres(g.split(",").filter(Boolean));
    if (p) setPrefs(p.split(",").filter(Boolean));
    if (r) {
      const n = Number(r);
      if (Number.isFinite(n)) setMinRating(n);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (genres.length) params.set("genre", genres.join(","));
    if (prefs.length) params.set("pref", prefs.join(","));
    if (minRating > 0) params.set("min_rating", String(minRating));
    const qs = params.toString();
    const url = qs ? `?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [genres, prefs, minRating]);

  /* ---------------- サジェスト外側クリック / ESC ---------------- */
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!suggestRef.current) return;
      if (!suggestRef.current.contains(e.target as Node)) setSuggestOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSuggestOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // サジェストが変わったら activeIndex をリセット
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset activeIndex when suggestions change
  useEffect(() => {
    setActiveIndex(-1);
  }, [suggestions]);

  /* ---------------- スポット取得 (bbox / フィルタ) ---------------- */
  useEffect(() => {
    const controller = new AbortController();
    const id = ++fetchIdRef.current;
    const timer = setTimeout(async () => {
      const params = new URLSearchParams();
      if (genres.length) params.set("genre", genres.join(","));
      if (prefs.length) params.set("pref", prefs.join(","));
      if (minRating > 0) params.set("min_rating", String(minRating));
      // ズームインしている時のみ bbox で絞り込み（描画負荷の最適化）
      if (bbox && zoom >= 8) {
        const pad = 0.15;
        const w = bbox[2] - bbox[0];
        const h = bbox[3] - bbox[1];
        const padded: Bbox = [
          bbox[0] - w * pad,
          bbox[1] - h * pad,
          bbox[2] + w * pad,
          bbox[3] + h * pad,
        ];
        const clamped = clampBbox(padded);
        params.set("bbox", clamped.map((n) => n.toFixed(5)).join(","));
      }
      setLoadingSpots(true);
      try {
        const res = await fetch(`/api/spots?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const data = (await res.json()) as SpotCollection;
        if (id === fetchIdRef.current) setSpots(data.features ?? []);
      } catch {
        /* aborted */
      } finally {
        if (id === fetchIdRef.current) setLoadingSpots(false);
      }
    }, 320);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [genres, prefs, minRating, bbox, zoom]);

  /* ---------------- サジェスト ---------------- */
  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/spots?q=${encodeURIComponent(q)}&limit=8`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const data = (await res.json()) as SpotCollection;
        setSuggestions(data.features ?? []);
      } catch {
        /* aborted */
      }
    }, 220);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  /* ---------------- 詳細取得（Abort対応） ---------------- */
  const openSpot = useCallback(async (spot: SpotFeature, fly = false) => {
    detailAbortRef.current?.abort();
    const ac = new AbortController();
    detailAbortRef.current = ac;
    setSelected(spot);
    setNearby([]);
    setDetailLoading(true);
    setSuggestOpen(false);
    if (fly) {
      const [lng, lat] = spot.geometry.coordinates;
      setFlyTarget({ lat, lng, zoom: 15, key: Date.now() });
    }
    try {
      const res = await fetch(`/api/spots/${spot.properties.spotcd}`, {
        signal: ac.signal,
      });
      if (res.ok) {
        const data = (await res.json()) as SpotFeature & {
          nearby: SpotFeature[];
        };
        setSelected({
          type: "Feature",
          geometry: data.geometry,
          properties: data.properties,
        });
        setNearby(data.nearby ?? []);
      }
    } catch {
      /* aborted or network error */
    } finally {
      if (detailAbortRef.current === ac) setDetailLoading(false);
    }
  }, []);

  const handleBounds = useCallback((next: Bbox, nextZoom: number) => {
    setBbox(next);
    setZoom(nextZoom);
  }, []);

  const locate = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserPosition(p);
        setFlyTarget({ ...p, zoom: 12, key: Date.now() });
      },
      () => {
        setFlyTarget({ lat: 35.681236, lng: 139.767125, zoom: 11, key: Date.now() });
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  const toggleGenre = (g: string) =>
    setGenres((prev) => (prev.includes(g) ? prev.filter((v) => v !== g) : [...prev, g]));

  const activeFilterCount = genres.length + prefs.length + (minRating > 0 ? 1 : 0);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-m3-surface-dim">
      <div className="absolute inset-0">
        <MapClient
          spots={spots}
          selectedId={selected?.properties.spotcd ?? null}
          onSelect={(s) => openSpot(s)}
          onBoundsChange={handleBounds}
          flyTarget={flyTarget}
          userPosition={userPosition}
          tile={tile}
        />
      </div>

      {/* ---------------- トップバー ---------------- */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1100] flex flex-col gap-2.5 p-3 md:p-4">
        <div
          ref={suggestRef}
          className="pointer-events-auto mx-auto flex w-full max-w-2xl flex-col"
        >
          {/* M3 Search Bar */}
          <div
            className={`flex items-center gap-2 border border-m3-outline-variant/40 bg-m3-surface-container-high/92 px-4 shadow-m3-3 backdrop-blur-xl transition-all duration-300 ${
              suggestOpen && suggestions.length
                ? "rounded-t-m3-xl rounded-b-none"
                : "rounded-m3-full"
            }`}
          >
            <Ghost size={20} className="shrink-0 text-m3-primary" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSuggestOpen(true);
              }}
              onFocus={() => setSuggestOpen(true)}
              onKeyDown={(e) => {
                if (!suggestOpen || suggestions.length === 0) {
                  if (e.key === "Escape") setSuggestOpen(false);
                  return;
                }
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActiveIndex((prev) => (prev + 1) % suggestions.length);
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActiveIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
                } else if (e.key === "Enter") {
                  if (activeIndex >= 0 && activeIndex < suggestions.length) {
                    e.preventDefault();
                    openSpot(suggestions[activeIndex], true);
                  }
                } else if (e.key === "Escape") {
                  setSuggestOpen(false);
                  setActiveIndex(-1);
                }
              }}
              placeholder="心霊スポット名・住所で検索"
              className="min-w-0 flex-1 bg-transparent py-3.5 text-body-lg text-m3-on-surface placeholder:text-m3-on-surface-variant/70 focus:outline-none"
              aria-label="スポット検索"
              aria-expanded={suggestOpen && suggestions.length > 0}
              aria-controls="ghost-suggest-list"
              aria-activedescendant={
                activeIndex >= 0
                  ? `ghost-suggest-${suggestions[activeIndex]?.properties.spotcd}`
                  : undefined
              }
              role="combobox"
              aria-autocomplete="list"
            />
            {query ? (
              <button
                type="button"
                aria-label="検索をクリア"
                onClick={() => {
                  setQuery("");
                  setSuggestions([]);
                }}
                className="grid size-8 place-items-center rounded-m3-full text-m3-on-surface-variant transition hover:bg-m3-surface-container-highest"
              >
                <X size={16} />
              </button>
            ) : (
              <Search size={18} className="text-m3-on-surface-variant" />
            )}
          </div>

          <AnimatePresence>
            {suggestOpen && suggestions.length ? (
              <motion.ul
                id="ghost-suggest-list"
                role="listbox"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="thin-scrollbar max-h-[46dvh] overflow-y-auto rounded-b-m3-xl border border-t-0 border-m3-outline-variant/40 bg-m3-surface-container-high/96 shadow-m3-3 backdrop-blur-xl"
              >
                {suggestions.map((s, idx) => (
                  // biome-ignore format lint: listbox > li[role=option] is valid ARIA pattern (MAP-4)
                  <li key={s.properties.spotcd} id={`ghost-suggest-${s.properties.spotcd}`} role="option" aria-selected={idx === activeIndex}>
                    <button
                      type="button"
                      onClick={() => openSpot(s, true)}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${
                        idx === activeIndex
                          ? "bg-m3-surface-container-highest"
                          : "hover:bg-m3-surface-container-highest"
                      }`}
                    >
                      <span className="text-lg">{genreEmoji(s.properties.genre)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body-md text-m3-on-surface">
                          {s.properties.name}
                        </span>
                        <span className="block truncate text-label-sm text-m3-on-surface-variant">
                          {s.properties.address ?? s.properties.prefecture}
                        </span>
                      </span>
                      <span className="shrink-0 text-label-md text-m3-secondary">
                        ★{s.properties.fearRating?.toFixed(1) ?? "–"}
                      </span>
                    </button>
                  </li>
                ))}
              </motion.ul>
            ) : null}
          </AnimatePresence>
        </div>

        {/* M3 Filter Chips (横スクロール) */}
        <div className="pointer-events-auto no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3 md:mx-0 md:justify-center md:px-0">
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            aria-expanded={filterOpen}
            aria-controls="filter-panel"
            className={`flex shrink-0 items-center gap-1.5 rounded-m3-full border px-3.5 py-2 text-label-lg shadow-m3-1 backdrop-blur-xl transition active:scale-95 ${
              activeFilterCount
                ? "border-transparent bg-m3-primary text-m3-on-primary"
                : "border-m3-outline-variant/50 bg-m3-surface-container-high/90 text-m3-on-surface"
            }`}
          >
            <SlidersHorizontal size={15} />
            フィルター
            {activeFilterCount ? (
              <span className="ml-0.5 rounded-m3-full bg-m3-on-primary/20 px-1.5 text-label-sm">
                {activeFilterCount}
              </span>
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => setMinRating((v) => (v >= 4 ? 0 : 4))}
            className={`flex shrink-0 items-center gap-1.5 rounded-m3-full border px-3.5 py-2 text-label-lg shadow-m3-1 backdrop-blur-xl transition active:scale-95 ${
              minRating >= 4
                ? "border-transparent bg-m3-secondary-container text-m3-on-secondary-container"
                : "border-m3-outline-variant/50 bg-m3-surface-container-high/90 text-m3-on-surface"
            }`}
          >
            <Star size={15} />
            怖さ 4.0+
          </button>

          {topGenres.map((g) => {
            const active = genres.includes(g.value);
            return (
              <button
                key={g.value}
                type="button"
                onClick={() => toggleGenre(g.value)}
                className={`flex shrink-0 items-center gap-1.5 rounded-m3-full border px-3.5 py-2 text-label-lg shadow-m3-1 backdrop-blur-xl transition active:scale-95 ${
                  active
                    ? "border-transparent bg-m3-primary-container text-m3-on-primary-container"
                    : "border-m3-outline-variant/50 bg-m3-surface-container-high/90 text-m3-on-surface"
                }`}
              >
                <span>{genreEmoji(g.value)}</span>
                {g.value}
                <span className="text-label-sm text-m3-on-surface-variant">{g.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ---------------- ステータスピル ---------------- */}
      <div className="pointer-events-none absolute bottom-4 left-1/2 z-[1050] -translate-x-1/2 md:bottom-5">
        <div className="flex items-center gap-2 rounded-m3-full border border-m3-outline-variant/40 bg-m3-surface-container-high/90 px-4 py-2 text-label-md text-m3-on-surface shadow-m3-2 backdrop-blur-xl">
          {loadingSpots ? (
            <Loader2 size={14} className="animate-spin text-m3-primary" />
          ) : (
            <Ghost size={14} className="text-m3-primary" />
          )}
          <span>
            表示中 <strong className="font-semibold">{spots.length}</strong> / 全国{" "}
            {facets.total.toLocaleString("ja-JP")} スポット
          </span>
        </div>
      </div>

      {/* 空状態（MAP-2: フィルタで 0 件時の fallback） */}
      {!loadingSpots && spots.length === 0 ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none absolute top-1/2 left-1/2 z-[1040] -translate-x-1/2 -translate-y-1/2 rounded-m3-xl border border-m3-outline-variant/30 bg-m3-surface-container-high/90 px-6 py-5 text-center shadow-m3-3 backdrop-blur-xl"
        >
          <Ghost className="mx-auto mb-2 text-m3-outline" size={28} />
          <p className="text-title-sm text-m3-on-surface">該当するスポットがありません</p>
          <p className="mt-1 text-body-sm text-m3-on-surface-variant">
            フィルターや地図の範囲を調整してください
          </p>
        </div>
      ) : null}

      {/* ---------------- FAB 群 ---------------- */}
      <div className="absolute right-3 bottom-24 z-[1100] flex flex-col gap-3 md:right-4 md:bottom-28">
        <button
          type="button"
          onClick={() => setTile((t) => (t === "dark" ? "light" : "dark"))}
          aria-label="地図スタイル切替"
          className="grid size-12 place-items-center rounded-m3-lg bg-m3-surface-container-high/92 text-m3-on-surface shadow-m3-3 backdrop-blur-xl transition hover:bg-m3-surface-container-highest active:scale-95"
        >
          <Layers size={20} />
        </button>
        <button
          type="button"
          onClick={locate}
          aria-label="現在地へ移動"
          className="grid size-16 place-items-center rounded-m3-xl bg-m3-primary-container text-m3-on-primary-container shadow-m3-4 transition hover:brightness-110 active:scale-95"
        >
          <LocateFixed size={24} />
        </button>
      </div>

      {/* ---------------- 詳細シート ---------------- */}
      <AnimatePresence>
        {selected ? (
          <SpotDetailSheet
            key={selected.properties.spotcd}
            spot={selected}
            nearby={nearby}
            loading={detailLoading}
            onClose={() => setSelected(null)}
            onSelectNearby={(s) => openSpot(s, true)}
          />
        ) : null}
      </AnimatePresence>

      {/* ---------------- フィルターパネル ---------------- */}
      <FilterPanel
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        facets={facets}
        genres={genres}
        prefs={prefs}
        minRating={minRating}
        onToggleGenre={toggleGenre}
        onTogglePref={(p) =>
          setPrefs((prev) => (prev.includes(p) ? prev.filter((v) => v !== p) : [...prev, p]))
        }
        onMinRating={setMinRating}
        onReset={() => {
          setGenres([]);
          setPrefs([]);
          setMinRating(0);
        }}
      />

      <DisclaimerDialog />

      {/* 免責再表示（フッター） */}
      <div className="pointer-events-none absolute bottom-2 left-3 z-[1100] md:bottom-3">
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.removeItem("ghostmap:disclaimer:v1");
            } catch {}
            window.location.reload();
          }}
          className="pointer-events-auto rounded-m3-full bg-m3-surface-container-high/80 px-3 py-1.5 text-label-sm text-m3-on-surface-variant backdrop-blur transition hover:bg-m3-surface-container-high"
        >
          免責を再表示
        </button>
      </div>
    </div>
  );
}
