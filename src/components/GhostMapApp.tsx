"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DisclaimerDialog from "@/components/DisclaimerDialog";
import FilterPanel from "@/components/FilterPanel";
import MaterialIcon from "@/components/MaterialIcon";
import SpotDetailSheet from "@/components/SpotDetailSheet";
import { type Bbox, clampBbox } from "@/lib/bbox";
import { m3Spring, m3Stagger } from "@/lib/motion";
import { genreEmoji, type SpotCollection, type SpotFacets, type SpotFeature } from "@/lib/types";

const MapClient = dynamic(() => import("@/components/Map/MapClient"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center bg-m3-surface-dim">
      <div className="flex flex-col items-center gap-3 text-m3-on-surface-variant">
        <span className="animate-spin">
          <MaterialIcon name="progress_activity" size={28} className="text-m3-primary" />
        </span>
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
  const shouldReduce = useReducedMotion();
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

  /* ---------------- フィルタ永続化（URLクエリ + LocalStorage ハイブリッド） ---------------- */
  const LS_FILTERS_KEY = "ghostmap:filters:v1";
  const hydratedRef = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let g = params.get("genre");
    let p = params.get("pref");
    let r = params.get("min_rating");
    // URL が空なら LocalStorage をフォールバック
    if (!g && !p && !r) {
      try {
        const raw = localStorage.getItem(LS_FILTERS_KEY);
        if (raw) {
          const o = JSON.parse(raw) as {
            genres?: string[];
            prefs?: string[];
            minRating?: number;
          };
          if (o.genres?.length) g = o.genres.join(",");
          if (o.prefs?.length) p = o.prefs.join(",");
          if (o.minRating) r = String(o.minRating);
        }
      } catch {
        /* ignore */
      }
    }
    if (g) setGenres(g.split(",").filter(Boolean));
    if (p) setPrefs(p.split(",").filter(Boolean));
    if (r) {
      const n = Number(r);
      if (Number.isFinite(n)) setMinRating(n);
    }
    hydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    const params = new URLSearchParams();
    if (genres.length) params.set("genre", genres.join(","));
    if (prefs.length) params.set("pref", prefs.join(","));
    if (minRating > 0) params.set("min_rating", String(minRating));
    const qs = params.toString();
    const url = qs ? `?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", url);
    try {
      localStorage.setItem(LS_FILTERS_KEY, JSON.stringify({ genres, prefs, minRating }));
    } catch {
      /* ignore */
    }
  }, [genres, prefs, minRating]);

  // 戻る/進む で URL から復元（popstate）
  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      setGenres(params.get("genre")?.split(",").filter(Boolean) ?? []);
      setPrefs(params.get("pref")?.split(",").filter(Boolean) ?? []);
      const r = params.get("min_rating");
      setMinRating(r ? Number(r) || 0 : 0);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

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
          {/* M3 Search Bar — shape morphs when suggestions open (M3E expressive morph) */}
          <motion.div
            layout={!shouldReduce}
            transition={shouldReduce ? { duration: 0 } : m3Spring.defaultSpatial}
            className={`flex items-center gap-2 border border-m3-outline-variant/40 bg-m3-surface-container-high/92 px-4 shadow-m3-3 backdrop-blur-xl ${
              suggestOpen && suggestions.length
                ? "rounded-t-m3-xl rounded-b-none"
                : "rounded-m3-full"
            }`}
            style={{
              borderRadius: suggestOpen && suggestions.length ? "28px 28px 0 0" : "999px",
            }}
          >
            <MaterialIcon name="skull" size={20} className="shrink-0 text-m3-primary" fill={1} />
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
              <motion.button
                type="button"
                aria-label="検索をクリア"
                onClick={() => {
                  setQuery("");
                  setSuggestions([]);
                }}
                whileHover={shouldReduce ? undefined : { scale: 1.08 }}
                whileTap={shouldReduce ? undefined : { scale: 0.92 }}
                transition={m3Spring.responsive}
                className="grid size-8 place-items-center rounded-m3-full text-m3-on-surface-variant transition hover:bg-m3-surface-container-highest"
              >
                <MaterialIcon name="close" size={16} />
              </motion.button>
            ) : (
              <MaterialIcon name="search" size={18} className="text-m3-on-surface-variant" />
            )}
          </motion.div>

          <AnimatePresence>
            {suggestOpen && suggestions.length ? (
              <motion.ul
                id="ghost-suggest-list"
                role="listbox"
                initial={shouldReduce ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.98 }}
                animate={shouldReduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                exit={shouldReduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
                transition={shouldReduce ? { duration: 0.12 } : m3Spring.defaultSpatial}
                className="thin-scrollbar max-h-[46dvh] overflow-y-auto rounded-b-m3-xl border border-t-0 border-m3-outline-variant/40 bg-m3-surface-container-high/96 shadow-m3-3 backdrop-blur-xl"
              >
                {suggestions.map((s, idx) => (
                  <motion.li
                    key={s.properties.spotcd}
                    id={`ghost-suggest-${s.properties.spotcd}`}
                    role="option"
                    aria-selected={idx === activeIndex}
                    initial={shouldReduce ? { opacity: 0 } : { opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={
                      shouldReduce
                        ? { duration: 0.12 }
                        : { ...m3Spring.responsive, delay: m3Stagger(idx, 28) }
                    }
                  >
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
                      <span className="flex items-center gap-0.5 shrink-0 text-label-md text-m3-secondary">
                        <MaterialIcon
                          name="star"
                          size={14}
                          fill={1}
                          className="text-m3-secondary"
                        />
                        {s.properties.fearRating?.toFixed(1) ?? "–"}
                      </span>
                    </button>
                  </motion.li>
                ))}
              </motion.ul>
            ) : null}
          </AnimatePresence>
        </div>

        {/* M3 Filter Chips — responsive spring + stagger */}
        <motion.div
          className="pointer-events-auto no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3 md:mx-0 md:justify-center md:px-0"
          initial={shouldReduce ? undefined : { opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={shouldReduce ? { duration: 0.15 } : m3Spring.defaultSpatial}
        >
          <motion.button
            type="button"
            onClick={() => setFilterOpen(true)}
            aria-expanded={filterOpen}
            aria-controls="filter-panel"
            whileHover={shouldReduce ? undefined : { scale: 1.02 }}
            whileTap={shouldReduce ? undefined : { scale: 0.97 }}
            transition={m3Spring.responsive}
            className={`flex shrink-0 items-center gap-1.5 rounded-m3-full border px-3.5 py-2 text-label-lg shadow-m3-1 backdrop-blur-xl m3-pressable ${
              activeFilterCount
                ? "border-transparent bg-m3-primary text-m3-on-primary"
                : "border-m3-outline-variant/50 bg-m3-surface-container-high/90 text-m3-on-surface"
            }`}
          >
            <MaterialIcon name="tune" size={15} fill={activeFilterCount ? 1 : 0} />
            フィルター
            {activeFilterCount ? (
              <motion.span
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                transition={m3Spring.expressive}
                className="ml-0.5 rounded-m3-full bg-m3-on-primary/20 px-1.5 text-label-sm"
              >
                {activeFilterCount}
              </motion.span>
            ) : null}
          </motion.button>

          <motion.button
            type="button"
            onClick={() => setMinRating((v) => (v >= 4 ? 0 : 4))}
            whileHover={shouldReduce ? undefined : { scale: 1.02 }}
            whileTap={shouldReduce ? undefined : { scale: 0.97 }}
            transition={m3Spring.responsive}
            className={`flex shrink-0 items-center gap-1.5 rounded-m3-full border px-3.5 py-2 text-label-lg shadow-m3-1 backdrop-blur-xl m3-pressable ${
              minRating >= 4
                ? "border-transparent bg-m3-secondary-container text-m3-on-secondary-container"
                : "border-m3-outline-variant/50 bg-m3-surface-container-high/90 text-m3-on-surface"
            }`}
          >
            <MaterialIcon name="kid_star" size={15} fill={minRating >= 4 ? 1 : 0} />
            怖さ 4.0+
          </motion.button>

          {topGenres.map((g, i) => {
            const active = genres.includes(g.value);
            return (
              <motion.button
                key={g.value}
                type="button"
                onClick={() => toggleGenre(g.value)}
                initial={shouldReduce ? undefined : { opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={
                  shouldReduce
                    ? { duration: 0.12 }
                    : { ...m3Spring.responsive, delay: m3Stagger(i, 32) }
                }
                whileHover={shouldReduce ? undefined : { scale: 1.03, y: -1 }}
                whileTap={shouldReduce ? undefined : { scale: 0.96 }}
                className={`flex shrink-0 items-center gap-1.5 rounded-m3-full border px-3.5 py-2 text-label-lg shadow-m3-1 backdrop-blur-xl m3-pressable ${
                  active
                    ? "border-transparent bg-m3-primary-container text-m3-on-primary-container"
                    : "border-m3-outline-variant/50 bg-m3-surface-container-high/90 text-m3-on-surface"
                }`}
              >
                <span>{genreEmoji(g.value)}</span>
                {g.value}
                <span className="text-label-sm text-m3-on-surface-variant">{g.count}</span>
              </motion.button>
            );
          })}
        </motion.div>
      </div>

      {/* ---------------- ステータスピル ---------------- */}
      <motion.div
        className="pointer-events-none absolute bottom-4 left-1/2 z-[1050] -translate-x-1/2 md:bottom-5"
        initial={shouldReduce ? undefined : { opacity: 0, y: 8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={shouldReduce ? { duration: 0.2 } : m3Spring.expressive}
      >
        <div className="flex items-center gap-2 rounded-m3-full border border-m3-outline-variant/40 bg-m3-surface-container-high/90 px-4 py-2 text-label-md text-m3-on-surface shadow-m3-2 backdrop-blur-xl">
          {loadingSpots ? (
            <span className="animate-spin">
              <MaterialIcon name="progress_activity" size={14} className="text-m3-primary" />
            </span>
          ) : (
            <MaterialIcon name="skull" size={14} className="text-m3-primary" fill={0} />
          )}
          <span>
            表示中 <strong className="font-semibold">{spots.length}</strong> / 全国{" "}
            {facets.total.toLocaleString("ja-JP")} スポット
          </span>
        </div>
      </motion.div>

      {/* 空状態（MAP-2: フィルタで 0 件時の fallback） */}
      <AnimatePresence>
        {!loadingSpots && spots.length === 0 ? (
          <motion.div
            role="status"
            aria-live="polite"
            initial={shouldReduce ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={shouldReduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
            transition={shouldReduce ? { duration: 0.15 } : m3Spring.expressive}
            className="pointer-events-none absolute top-1/2 left-1/2 z-[1040] -translate-x-1/2 -translate-y-1/2 rounded-m3-xl border border-m3-outline-variant/30 bg-m3-surface-container-high/90 px-6 py-5 text-center shadow-m3-3 backdrop-blur-xl"
          >
            <MaterialIcon name="search_off" size={28} className="mx-auto mb-2 text-m3-outline" />
            <p className="text-title-sm text-m3-on-surface">該当するスポットがありません</p>
            <p className="mt-1 text-body-sm text-m3-on-surface-variant">
              フィルターや地図の範囲を調整してください
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* ---------------- FAB 群 ---------------- */}
      <div className="absolute right-3 bottom-24 z-[1100] flex flex-col gap-3 md:right-4 md:bottom-28">
        <motion.button
          type="button"
          onClick={() => setTile((t) => (t === "dark" ? "light" : "dark"))}
          aria-label="地図スタイル切替"
          whileHover={shouldReduce ? undefined : { scale: 1.06, y: -1 }}
          whileTap={shouldReduce ? undefined : { scale: 0.94 }}
          transition={m3Spring.responsive}
          className="grid size-12 place-items-center rounded-m3-lg bg-m3-surface-container-high/92 text-m3-on-surface shadow-m3-3 backdrop-blur-xl m3-pressable"
        >
          <MaterialIcon name={tile === "dark" ? "light_mode" : "dark_mode"} size={20} />
        </motion.button>
        <motion.button
          type="button"
          onClick={locate}
          aria-label="現在地へ移動"
          whileHover={shouldReduce ? undefined : { scale: 1.04, y: -2 }}
          whileTap={shouldReduce ? undefined : { scale: 0.93 }}
          transition={m3Spring.expressive}
          className="grid size-16 place-items-center rounded-m3-xl bg-m3-primary-container text-m3-on-primary-container shadow-m3-4 m3-pressable"
          style={{ borderRadius: 28 }}
        >
          <MaterialIcon name="my_location" size={24} />
        </motion.button>
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
          try {
            localStorage.removeItem("ghostmap:filters:v1");
          } catch {
            /* ignore */
          }
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
