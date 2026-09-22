"use client";

import { motion } from "framer-motion";
import {
  ExternalLink,
  Ghost,
  MapPin,
  Navigation,
  Quote,
  Star,
  Trophy,
  X,
} from "lucide-react";
import { fearTone, genreEmoji, type SpotFeature } from "@/lib/types";

type Props = {
  spot: SpotFeature;
  nearby: SpotFeature[];
  loading: boolean;
  onClose: () => void;
  onSelectNearby: (spot: SpotFeature) => void;
};

function Stars({ value }: { value: number | null }) {
  const v = value ?? 0;
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={15}
          className={
            v >= i - 0.25
              ? "fill-m3-secondary text-m3-secondary"
              : v >= i - 0.75
                ? "fill-m3-secondary/50 text-m3-secondary"
                : "text-m3-outline-variant"
          }
        />
      ))}
    </div>
  );
}

function StatTile({
  label,
  value,
  suffix,
  icon,
}: {
  label: string;
  value: string;
  suffix?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex-1 rounded-m3-lg bg-m3-surface-container-highest/70 px-3 py-2.5">
      <p className="flex items-center gap-1 text-label-sm text-m3-on-surface-variant">
        {icon}
        {label}
      </p>
      <p className="mt-0.5 text-title-md font-semibold text-m3-on-surface">
        {value}
        {suffix ? (
          <span className="ml-0.5 text-label-md font-normal text-m3-on-surface-variant">
            {suffix}
          </span>
        ) : null}
      </p>
    </div>
  );
}

function Chip({
  children,
  tone = "surface",
}: {
  children: React.ReactNode;
  tone?: "surface" | "primary" | "tertiary";
}) {
  const toneClass =
    tone === "primary"
      ? "bg-m3-primary-container text-m3-on-primary-container"
      : tone === "tertiary"
        ? "bg-m3-tertiary-container text-m3-on-tertiary-container"
        : "bg-m3-surface-container-highest text-m3-on-surface-variant";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-m3-sm px-2.5 py-1 text-label-md ${toneClass}`}
    >
      {children}
    </span>
  );
}

export default function SpotDetailSheet({
  spot,
  nearby,
  loading,
  onClose,
  onSelectNearby,
}: Props) {
  const p = spot.properties;
  const [lng, lat] = spot.geometry.coordinates;
  const tone = fearTone(p.fearRating);
  const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

  return (
    <motion.aside
      key={p.spotcd}
      initial={{ y: "100%", opacity: 0.6 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: "100%", opacity: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 36, mass: 0.9 }}
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0, bottom: 0.4 }}
      onDragEnd={(_, info) => {
        if (info.offset.y > 120 || info.velocity.y > 600) onClose();
      }}
      className="pointer-events-auto fixed inset-x-0 bottom-0 z-[1200] max-h-[82dvh] overflow-hidden rounded-t-m3-xxl border border-b-0 border-m3-outline-variant/40 bg-m3-surface-container-high/95 shadow-m3-5 backdrop-blur-xl md:inset-y-0 md:right-auto md:left-0 md:max-h-none md:w-[420px] md:rounded-t-none md:rounded-r-m3-xxl md:border-l-0"
    >
      <div className="flex h-full max-h-[82dvh] flex-col md:max-h-none">
        {/* drag handle (mobile) */}
        <div className="flex shrink-0 justify-center pt-2.5 md:hidden">
          <div className="h-1 w-10 rounded-full bg-m3-outline-variant" />
        </div>

        <header className="flex shrink-0 items-start gap-3 px-5 pt-3 pb-2">
          <div
            className="grid size-12 shrink-0 place-items-center rounded-m3-lg text-2xl"
            style={{ background: tone.bg, color: tone.fg }}
          >
            {genreEmoji(p.genre)}
          </div>
          <div className="min-w-0 flex-1">
            {p.kana ? (
              <p className="truncate text-label-sm text-m3-on-surface-variant">
                {p.kana}
              </p>
            ) : null}
            <h2 className="truncate text-headline-sm font-semibold tracking-tight text-m3-on-surface">
              {p.name}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {p.genre ? <Chip tone="primary">{p.genre}</Chip> : null}
              {p.status ? <Chip tone="tertiary">{p.status}</Chip> : null}
              <Chip>
                <span
                  className="size-1.5 rounded-full"
                  style={{ background: tone.bg }}
                />
                危険度 {tone.label}
              </Chip>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="grid size-10 shrink-0 place-items-center rounded-m3-full text-m3-on-surface-variant transition hover:bg-m3-surface-container-highest active:scale-95"
          >
            <X size={20} />
          </button>
        </header>

        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-32 md:pb-6">
          {p.imageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={p.imageUrl}
              alt={p.name}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="mb-4 h-44 w-full rounded-m3-xl object-cover shadow-m3-1"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          ) : null}
          {/* 評価カード */}
          <section className="rounded-m3-xl bg-m3-surface-container/80 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-label-md text-m3-on-surface-variant">
                  怖さ評価
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-display-sm font-semibold leading-none text-m3-on-surface">
                    {p.fearRating?.toFixed(2) ?? "–"}
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <Stars value={p.fearRating} />
                    <span className="text-label-sm text-m3-on-surface-variant">
                      {p.ratingCount?.toLocaleString("ja-JP") ?? 0} 人が評価
                    </span>
                  </div>
                </div>
              </div>
              <div
                className="grid size-14 place-items-center rounded-m3-full text-label-lg font-bold"
                style={{ background: tone.bg, color: tone.fg }}
              >
                {tone.label}
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <StatTile
                label="全国ランク"
                value={p.nationalRank ? `${p.nationalRank}` : "–"}
                suffix={p.nationalRank ? "位" : undefined}
                icon={<Trophy size={12} />}
              />
              <StatTile
                label="県別ランク"
                value={p.prefRank ? `${p.prefRank}` : "–"}
                suffix={p.prefRank ? "位" : undefined}
                icon={<Ghost size={12} />}
              />
              <StatTile
                label="総合得点"
                value={p.totalScore?.toLocaleString("ja-JP") ?? "–"}
                suffix="点"
              />
            </div>
          </section>

          {/* 概要 */}
          {p.outline ? (
            <p className="mt-4 text-body-md leading-relaxed text-m3-on-surface-variant">
              {p.outline}
            </p>
          ) : null}

          {/* 現象・特徴 */}
          {p.phenomena.length || p.features.length ? (
            <section className="mt-4">
              <h3 className="text-title-sm font-semibold text-m3-on-surface">
                心霊現象・特徴
              </h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {p.phenomena.map((ph) => (
                  <Chip key={ph} tone="primary">
                    👁️ {ph}
                  </Chip>
                ))}
                {p.features.map((f) => (
                  <Chip key={f} tone="tertiary">
                    🔖 {f}
                  </Chip>
                ))}
              </div>
            </section>
          ) : null}

          {/* 住所 */}
          <section className="mt-4 flex items-start gap-2 rounded-m3-lg bg-m3-surface-container/60 p-3">
            <MapPin size={16} className="mt-0.5 shrink-0 text-m3-primary" />
            <div className="min-w-0">
              <p className="text-body-md text-m3-on-surface">
                {p.address ?? "住所不明"}
              </p>
              <p className="mt-0.5 text-label-sm text-m3-on-surface-variant">
                {lat.toFixed(6)}, {lng.toFixed(6)}
              </p>
            </div>
          </section>

          {/* 代表コメント */}
          {p.comment ? (
            <blockquote className="mt-4 rounded-m3-lg border-l-4 border-m3-secondary bg-m3-secondary-container/25 p-3.5">
              <Quote size={14} className="mb-1 text-m3-secondary" />
              <p className="text-body-md leading-relaxed whitespace-pre-line text-m3-on-surface">
                {p.comment}
              </p>
            </blockquote>
          ) : null}

          {/* 近くのスポット */}
          <section className="mt-5">
            <h3 className="text-title-sm font-semibold text-m3-on-surface">
              近くの心霊スポット
            </h3>
            {loading ? (
              <div className="mt-2 space-y-2">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-12 animate-pulse rounded-m3-lg bg-m3-surface-container"
                  />
                ))}
              </div>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {nearby.map((n) => (
                  <li key={n.properties.spotcd}>
                    <button
                      type="button"
                      onClick={() => onSelectNearby(n)}
                      className="flex w-full items-center gap-3 rounded-m3-lg bg-m3-surface-container/70 px-3 py-2 text-left transition hover:bg-m3-surface-container-highest active:scale-[0.99]"
                    >
                      <span className="text-lg">
                        {genreEmoji(n.properties.genre)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body-md text-m3-on-surface">
                          {n.properties.name}
                        </span>
                        <span className="block truncate text-label-sm text-m3-on-surface-variant">
                          {n.properties.prefecture} {n.properties.city}
                        </span>
                      </span>
                      <span className="text-label-md text-m3-secondary">
                        ★{n.properties.fearRating?.toFixed(1) ?? "–"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* アクション */}
        <div className="shrink-0 space-y-2 border-t border-m3-outline-variant/30 bg-m3-surface-container-high/90 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
          <a
            href={navUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-m3-full bg-m3-primary px-6 py-3.5 text-label-lg font-semibold text-m3-on-primary shadow-m3-2 transition hover:shadow-m3-3 active:scale-[0.98]"
          >
            <Navigation size={18} />
            Googleマップで行く
          </a>
          <a
            href={p.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-m3-full bg-m3-secondary-container/70 px-6 py-3 text-label-lg font-medium text-m3-on-secondary-container transition hover:bg-m3-secondary-container active:scale-[0.98]"
          >
            <ExternalLink size={16} />
            全国心霊マップで元記事を見る
          </a>
        </div>
      </div>
    </motion.aside>
  );
}
