"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import { m3Spring, m3Stagger } from "@/lib/motion";
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
  const shouldReduce = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const nodes = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey) {
          if (active === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (active === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener("keydown", onKey);
    // フォーカスをパネル内に移動（WCAG 2.4.3）— 最初のボタンにフォーカス
    const firstBtn = panelRef.current?.querySelector<HTMLElement>("button");
    (firstBtn ?? panelRef.current)?.focus();
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
            transition={shouldReduce ? { duration: 0.15 } : { duration: 0.22, ease: "easeOut" }}
            className="fixed inset-0 z-[1400] cursor-default bg-m3-scrim/50 backdrop-blur-[2px]"
          />
          <motion.div
            ref={panelRef}
            id="filter-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="filter-title"
            tabIndex={-1}
            initial={shouldReduce ? { opacity: 0 } : { y: "100%" }}
            animate={shouldReduce ? { opacity: 1 } : { y: 0 }}
            exit={shouldReduce ? { opacity: 0 } : { y: "100%" }}
            transition={shouldReduce ? { duration: 0.18 } : m3Spring.expressive}
            // M3E: default-spatial for bottom sheet, expressive for emphasis; drag handle handled by shape morph
            className="fixed inset-x-0 bottom-0 z-[1500] max-h-[80dvh] overflow-hidden rounded-t-m3-xxl border border-b-0 border-m3-outline-variant/40 bg-m3-surface-container-high shadow-m3-5 md:inset-x-auto md:right-0 md:bottom-0 md:top-0 md:max-h-none md:w-[400px] md:rounded-t-none md:rounded-l-m3-xxl focus:outline-none"
            style={{ willChange: "transform" }}
          >
            <div className="flex justify-center pt-2.5 md:hidden">
              <div className="h-1 w-10 rounded-full bg-m3-outline-variant" />
            </div>
            <header className="flex items-center justify-between px-5 pt-3 pb-1">
              <h2 id="filter-title" className="text-title-lg font-semibold text-m3-on-surface">
                絞り込み
              </h2>
              <div className="flex items-center gap-1">
                <motion.button
                  type="button"
                  onClick={onReset}
                  whileHover={shouldReduce ? undefined : { scale: 1.04 }}
                  whileTap={shouldReduce ? undefined : { scale: 0.96 }}
                  transition={m3Spring.responsive}
                  className="flex items-center gap-1 rounded-m3-full px-3 py-2 text-label-md text-m3-on-surface-variant transition hover:bg-m3-surface-container-highest m3-pressable"
                >
                  <MaterialIcon name="restart_alt" size={16} />
                  リセット
                </motion.button>
                <motion.button
                  type="button"
                  onClick={onClose}
                  aria-label="閉じる"
                  whileHover={shouldReduce ? undefined : { scale: 1.08, rotate: 90 }}
                  whileTap={shouldReduce ? undefined : { scale: 0.9 }}
                  transition={m3Spring.responsive}
                  className="grid size-10 place-items-center rounded-m3-full text-m3-on-surface-variant transition hover:bg-m3-surface-container-highest"
                >
                  <MaterialIcon name="close" size={20} />
                </motion.button>
              </div>
            </header>

            <div className="thin-scrollbar max-h-[62dvh] overflow-y-auto px-5 pb-28 md:max-h-[calc(100dvh-140px)]">
              <section className="mt-3">
                <h3 className="text-title-sm font-semibold text-m3-on-surface">怖さ評価（最低）</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {RATINGS.map((r, idx) => (
                    <motion.button
                      key={r}
                      type="button"
                      onClick={() => onMinRating(r)}
                      initial={shouldReduce ? undefined : { opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={
                        shouldReduce
                          ? { duration: 0.12 }
                          : { ...m3Spring.responsive, delay: m3Stagger(idx, 30) }
                      }
                      whileHover={shouldReduce ? undefined : { scale: 1.04, y: -1 }}
                      whileTap={shouldReduce ? undefined : { scale: 0.96 }}
                      className={`rounded-m3-full border px-3.5 py-2 text-label-lg m3-pressable ${
                        minRating === r
                          ? "border-transparent bg-m3-secondary-container text-m3-on-secondary-container"
                          : "border-m3-outline-variant/60 text-m3-on-surface-variant hover:bg-m3-surface-container-highest"
                      }`}
                    >
                      {r === 0 ? "すべて" : `★ ${r.toFixed(1)}+`}
                    </motion.button>
                  ))}
                </div>
              </section>

              <section className="mt-5">
                <h3 className="text-title-sm font-semibold text-m3-on-surface">ジャンル</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {facets.genres.map((g, idx) => {
                    const active = genres.includes(g.value);
                    return (
                      <motion.button
                        key={g.value}
                        type="button"
                        onClick={() => onToggleGenre(g.value)}
                        initial={shouldReduce ? undefined : { opacity: 0, y: 6, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={
                          shouldReduce
                            ? { duration: 0.14 }
                            : { ...m3Spring.responsive, delay: m3Stagger(idx, 22) }
                        }
                        whileHover={shouldReduce ? undefined : { scale: 1.03, y: -1 }}
                        whileTap={shouldReduce ? undefined : { scale: 0.95 }}
                        className={`flex items-center gap-1.5 rounded-m3-full border px-3 py-2 text-label-lg m3-pressable ${
                          active
                            ? "border-transparent bg-m3-primary-container text-m3-on-primary-container"
                            : "border-m3-outline-variant/60 text-m3-on-surface-variant hover:bg-m3-surface-container-highest"
                        }`}
                        layout={!shouldReduce}
                      >
                        <span>{genreEmoji(g.value)}</span>
                        {g.value}
                        <span className="text-label-sm opacity-70">{g.count}</span>
                      </motion.button>
                    );
                  })}
                </div>
              </section>

              <section className="mt-5">
                <h3 className="text-title-sm font-semibold text-m3-on-surface">都道府県</h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {facets.prefectures.map((p, idx) => {
                    const active = prefs.includes(p.value);
                    return (
                      <motion.button
                        key={p.value}
                        type="button"
                        onClick={() => onTogglePref(p.value)}
                        initial={shouldReduce ? undefined : { opacity: 0, scale: 0.92 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={
                          shouldReduce
                            ? { duration: 0.12 }
                            : { ...m3Spring.responsive, delay: m3Stagger(idx, 16) }
                        }
                        whileHover={shouldReduce ? undefined : { scale: 1.05 }}
                        whileTap={shouldReduce ? undefined : { scale: 0.95 }}
                        className={`rounded-m3-full border px-3 py-1.5 text-label-md m3-pressable ${
                          active
                            ? "border-transparent bg-m3-tertiary-container text-m3-on-tertiary-container"
                            : "border-m3-outline-variant/50 text-m3-on-surface-variant hover:bg-m3-surface-container-highest"
                        }`}
                      >
                        {p.value}
                      </motion.button>
                    );
                  })}
                </div>
              </section>
            </div>

            <motion.div
              className="absolute inset-x-0 bottom-0 border-t border-m3-outline-variant/30 bg-m3-surface-container-high/95 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur"
              initial={shouldReduce ? undefined : { y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={
                shouldReduce ? { duration: 0.15 } : { ...m3Spring.defaultSpatial, delay: 0.12 }
              }
            >
              <motion.button
                type="button"
                onClick={onClose}
                whileHover={shouldReduce ? undefined : { scale: 1.01, y: -1 }}
                whileTap={shouldReduce ? undefined : { scale: 0.97 }}
                transition={m3Spring.expressive}
                className="w-full rounded-m3-full bg-m3-primary py-3.5 text-label-lg font-semibold text-m3-on-primary shadow-m3-2 m3-pressable"
              >
                この条件で表示
              </motion.button>
            </motion.div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
