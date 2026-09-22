"use client";

import { AnimatePresence, motion } from "framer-motion";
import { RotateCcw, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { genreEmoji, type SpotFacets } from "@/lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  facets: SpotFacets;
  genres: string[];
  prefs: string[];
  minRating: number;
  onToggleGenre: (genre: string) => void;
  onTogglePref: (pref: string) => void;
  onMinRating: (value: number) => void;
  onReset: () => void;
};

const RATINGS = [0, 3, 3.6, 4.2];

export default function FilterPanel({
  open,
  onClose,
  facets,
  genres,
  prefs,
  minRating,
  onToggleGenre,
  onTogglePref,
  onMinRating,
  onReset,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // フォーカスをパネル内に移動（WCAG 2.4.3）
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="フィルターを閉じる"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1400] cursor-default bg-m3-scrim/50 backdrop-blur-[2px]"
          />
          <motion.div
            ref={panelRef}
            id="filter-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="filter-title"
            tabIndex={-1}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 32 }}
            className="fixed inset-x-0 bottom-0 z-[1500] max-h-[80dvh] overflow-hidden rounded-t-m3-xxl border border-b-0 border-m3-outline-variant/40 bg-m3-surface-container-high shadow-m3-5 md:inset-x-auto md:right-0 md:bottom-0 md:top-0 md:max-h-none md:w-[400px] md:rounded-t-none md:rounded-l-m3-xxl focus:outline-none"
          >
            <div className="flex justify-center pt-2.5 md:hidden">
              <div className="h-1 w-10 rounded-full bg-m3-outline-variant" />
            </div>
            <header className="flex items-center justify-between px-5 pt-3 pb-1">
              <h2 id="filter-title" className="text-title-lg font-semibold text-m3-on-surface">
                絞り込み
              </h2>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onReset}
                  className="flex items-center gap-1 rounded-m3-full px-3 py-2 text-label-md text-m3-on-surface-variant transition hover:bg-m3-surface-container-highest"
                >
                  <RotateCcw size={14} />
                  リセット
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="閉じる"
                  className="grid size-10 place-items-center rounded-m3-full text-m3-on-surface-variant transition hover:bg-m3-surface-container-highest"
                >
                  <X size={20} />
                </button>
              </div>
            </header>

            <div className="thin-scrollbar max-h-[62dvh] overflow-y-auto px-5 pb-28 md:max-h-[calc(100dvh-140px)]">
              <section className="mt-3">
                <h3 className="text-title-sm font-semibold text-m3-on-surface">怖さ評価（最低）</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {RATINGS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => onMinRating(r)}
                      className={`rounded-m3-full border px-3.5 py-2 text-label-lg transition active:scale-95 ${
                        minRating === r
                          ? "border-transparent bg-m3-secondary-container text-m3-on-secondary-container"
                          : "border-m3-outline-variant/60 text-m3-on-surface-variant hover:bg-m3-surface-container-highest"
                      }`}
                    >
                      {r === 0 ? "すべて" : `★ ${r.toFixed(1)}+`}
                    </button>
                  ))}
                </div>
              </section>

              <section className="mt-5">
                <h3 className="text-title-sm font-semibold text-m3-on-surface">ジャンル</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {facets.genres.map((g) => {
                    const active = genres.includes(g.value);
                    return (
                      <button
                        key={g.value}
                        type="button"
                        onClick={() => onToggleGenre(g.value)}
                        className={`flex items-center gap-1.5 rounded-m3-full border px-3 py-2 text-label-lg transition active:scale-95 ${
                          active
                            ? "border-transparent bg-m3-primary-container text-m3-on-primary-container"
                            : "border-m3-outline-variant/60 text-m3-on-surface-variant hover:bg-m3-surface-container-highest"
                        }`}
                      >
                        <span>{genreEmoji(g.value)}</span>
                        {g.value}
                        <span className="text-label-sm opacity-70">{g.count}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="mt-5">
                <h3 className="text-title-sm font-semibold text-m3-on-surface">都道府県</h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {facets.prefectures.map((p) => {
                    const active = prefs.includes(p.value);
                    return (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => onTogglePref(p.value)}
                        className={`rounded-m3-full border px-3 py-1.5 text-label-md transition active:scale-95 ${
                          active
                            ? "border-transparent bg-m3-tertiary-container text-m3-on-tertiary-container"
                            : "border-m3-outline-variant/50 text-m3-on-surface-variant hover:bg-m3-surface-container-highest"
                        }`}
                      >
                        {p.value}
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>

            <div className="absolute inset-x-0 bottom-0 border-t border-m3-outline-variant/30 bg-m3-surface-container-high/95 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-m3-full bg-m3-primary py-3.5 text-label-lg font-semibold text-m3-on-primary shadow-m3-2 transition active:scale-[0.98]"
              >
                この条件で表示
              </button>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
