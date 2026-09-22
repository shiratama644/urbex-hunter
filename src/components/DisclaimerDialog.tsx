"use client";

import { AnimatePresence, motion } from "framer-motion";
import { HeartHandshake, ShieldAlert, TriangleAlert, UserRoundX } from "lucide-react";
import { useEffect, useState } from "react";

const STORAGE_KEY = "ghostmap:disclaimer:v1";

const ITEMS = [
  {
    icon: UserRoundX,
    title: "私有地への無断侵入は禁止",
    body: "掲載地点には私有地・立入禁止区域が含まれます。無断侵入は不法侵入罪に問われます。必ず公道や許可された場所からの見学に留めてください。",
  },
  {
    icon: HeartHandshake,
    title: "近隣住民への配慮",
    body: "深夜の大声・路上駐車・ゴミの放置は絶対にやめましょう。多くのスポットは生活圏の中にあります。",
  },
  {
    icon: TriangleAlert,
    title: "自己責任・免責事項",
    body: "本アプリの情報は「全国心霊マップ」より収集した参考情報です。訪問により生じた事故・怪我・トラブル等について、当方は一切の責任を負いません。",
  },
];

export default function DisclaimerDialog() {
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
          role="dialog"
          aria-modal="true"
          aria-labelledby="disclaimer-title"
        >
          <motion.div
            initial={{ scale: 0.86, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.92, y: 16, opacity: 0 }}
            transition={{ type: "spring", stiffness: 330, damping: 26 }}
            className="thin-scrollbar max-h-[86dvh] w-full max-w-md overflow-y-auto rounded-m3-xxl bg-m3-surface-container-high p-6 shadow-m3-5"
          >
            <div className="mx-auto grid size-14 place-items-center rounded-m3-full bg-m3-error-container text-m3-error">
              <ShieldAlert size={26} />
            </div>
            <h2
              id="disclaimer-title"
              className="mt-4 text-center text-headline-sm font-semibold text-m3-on-surface"
            >
              安全に楽しむための同意
            </h2>
            <p className="mt-1.5 text-center text-body-md text-m3-on-surface-variant">
              全国心霊マップ Explorer をご利用の前に、以下をご確認ください。
            </p>

            <ul className="mt-5 space-y-3">
              {ITEMS.map(({ icon: Icon, title, body }) => (
                <li
                  key={title}
                  className="flex gap-3 rounded-m3-lg bg-m3-surface-container/80 p-3.5"
                >
                  <Icon size={18} className="mt-0.5 shrink-0 text-m3-primary" />
                  <div>
                    <p className="text-title-sm font-semibold text-m3-on-surface">{title}</p>
                    <p className="mt-0.5 text-body-sm leading-relaxed text-m3-on-surface-variant">
                      {body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={accept}
              className="mt-6 w-full rounded-m3-full bg-m3-primary py-3.5 text-label-lg font-semibold text-m3-on-primary shadow-m3-2 transition hover:shadow-m3-3 active:scale-[0.98]"
            >
              同意して地図を開く
            </button>
            <p className="mt-3 text-center text-label-sm text-m3-on-surface-variant">
              データ提供: 全国心霊マップ (ghostmap.jp) / 非公式ファンアプリ
            </p>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
