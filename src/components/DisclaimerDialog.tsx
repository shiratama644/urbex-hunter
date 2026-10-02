"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import { m3Spring, m3Stagger } from "@/lib/motion";

const STORAGE_KEY = "ghostmap:disclaimer:v1";

const ITEMS = [
  {
    icon: "info",
    title: "情報の正確性は保証しません",
    body: "本アプリの情報は「全国心霊マップ」より収集した参考情報です。現地の状況は変化するため、正確性を保証しません。",
  },
  {
    icon: "person_cancel",
    title: "私有地・立入禁止区域への侵入は禁止",
    body: "掲載地点には私有地・立入禁止区域が含まれます。法令とマナーを守り、無断侵入はしないでください。",
  },
  {
    icon: "volunteer_activism",
    title: "近隣住民・施設への配慮を最優先",
    body: "夜間の騒音・路上駐車・ライト等の迷惑行為をしないでください。多くのスポットは生活圏の中にあります。",
  },
  {
    icon: "warning",
    title: "訪問は各自の責任 — 免責",
    body: "心霊スポットへの訪問は各自の責任で行ってください。事故・怪我・トラブルについて運営は責任を負いません。",
  },
  {
    icon: "terrain",
    title: "危険な場所では安全を最優先",
    body: "崖・トンネル・廃墟・ダム等では無理な侵入をしないでください。安全を最優先し、危険を感じたら引き返してください。",
  },
] as const;

export default function DisclaimerDialog() {
  const shouldReduce = useReducedMotion();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  const accept = () => {
    try {
      localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[2000] grid place-items-center bg-m3-scrim/70 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={shouldReduce ? { duration: 0.15 } : { duration: 0.22, ease: "easeOut" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="disclaimer-title"
        >
          <motion.div
            initial={
              shouldReduce ? { opacity: 0, scale: 0.96 } : { scale: 0.86, y: 30, opacity: 0 }
            }
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={shouldReduce ? { opacity: 0, scale: 0.98 } : { scale: 0.92, y: 16, opacity: 0 }}
            transition={shouldReduce ? { duration: 0.18 } : m3Spring.expressive}
            // M3E: dialog container — slow-spatial for large modal, expressive overshoot
            style={{ willChange: "transform, opacity" }}
            className="thin-scrollbar max-h-[86dvh] w-full max-w-md overflow-y-auto rounded-m3-xxl bg-m3-surface-container-high p-6 shadow-m3-5"
          >
            <motion.div
              className="mx-auto grid size-14 place-items-center rounded-m3-full bg-m3-error-container text-m3-error"
              initial={shouldReduce ? undefined : { scale: 0.7, rotate: -8 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={
                shouldReduce ? { duration: 0.15 } : { ...m3Spring.expressive, delay: 0.12 }
              }
            >
              <MaterialIcon name="shield" size={26} fill={1} />
            </motion.div>
            <motion.h2
              id="disclaimer-title"
              className="mt-4 text-center text-headline-sm font-semibold text-m3-on-surface"
              initial={shouldReduce ? undefined : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={
                shouldReduce ? { duration: 0.15 } : { ...m3Spring.defaultSpatial, delay: 0.14 }
              }
            >
              安全に楽しむための同意
            </motion.h2>
            <motion.p
              className="mt-1.5 text-center text-body-md text-m3-on-surface-variant"
              initial={shouldReduce ? undefined : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={
                shouldReduce ? { duration: 0.15 } : { ...m3Spring.defaultSpatial, delay: 0.18 }
              }
            >
              全国心霊マップ Explorer をご利用の前に、以下をご確認ください。
            </motion.p>

            <ul className="mt-5 space-y-3">
              {ITEMS.map(({ icon, title, body }, idx) => (
                <motion.li
                  key={title}
                  initial={shouldReduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={
                    shouldReduce
                      ? { duration: 0.14 }
                      : { ...m3Spring.responsive, delay: m3Stagger(idx, 40) }
                  }
                  className="flex gap-3 rounded-m3-lg bg-m3-surface-container/80 p-3.5"
                >
                  <MaterialIcon name={icon} size={18} className="mt-0.5 shrink-0 text-m3-primary" />
                  <div>
                    <p className="text-title-sm font-semibold text-m3-on-surface">{title}</p>
                    <p className="mt-0.5 text-body-sm leading-relaxed text-m3-on-surface-variant">
                      {body}
                    </p>
                  </div>
                </motion.li>
              ))}
            </ul>

            <motion.button
              type="button"
              onClick={accept}
              initial={shouldReduce ? undefined : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={
                shouldReduce ? { duration: 0.15 } : { ...m3Spring.defaultSpatial, delay: 0.34 }
              }
              whileHover={shouldReduce ? undefined : { scale: 1.01, y: -1 }}
              whileTap={shouldReduce ? undefined : { scale: 0.97 }}
              className="mt-6 w-full rounded-m3-full bg-m3-primary py-3.5 text-label-lg font-semibold text-m3-on-primary shadow-m3-2 m3-pressable"
            >
              同意して地図を開く
            </motion.button>
            <motion.p
              className="mt-3 text-center text-label-sm text-m3-on-surface-variant"
              initial={shouldReduce ? undefined : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={
                shouldReduce ? { duration: 0.15 } : { ...m3Spring.defaultEffects, delay: 0.38 }
              }
            >
              データ提供: 全国心霊マップ (ghostmap.jp) / 非公式ファンアプリ
            </motion.p>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
