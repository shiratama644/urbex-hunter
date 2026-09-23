import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "material-symbols/rounded.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "全国心霊マップ Explorer | 日本全国の心霊スポット地図",
  description:
    "全国心霊マップのスポットデータを Material 3 Expressive デザインの地図UIで探索。ジャンル・都道府県・怖さ評価で絞り込み、クラスタリング地図から詳細・ナビゲーションまで。",
  keywords: ["心霊スポット", "心霊マップ", "地図", "怖い場所", "廃墟", "トンネル"],
  openGraph: {
    title: "全国心霊マップ Explorer",
    description: "日本全国の心霊スポットをクラスタリング地図で探索する非公式アプリ",
    type: "website",
    locale: "ja_JP",
  },
};

export const viewport: Viewport = {
  themeColor: "#121016",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-m3-surface-dim text-m3-on-surface antialiased">{children}</body>
    </html>
  );
}
