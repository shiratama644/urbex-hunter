import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid h-dvh place-items-center bg-m3-surface-dim p-6 text-center">
      <div className="max-w-md rounded-m3-xl bg-m3-surface-container-high p-8 shadow-m3-3">
        <h1 className="text-display-sm font-semibold text-m3-on-surface">404</h1>
        <p className="mt-2 text-title-md text-m3-on-surface">ページが見つかりません</p>
        <p className="mt-1 text-body-md text-m3-on-surface-variant">
          URL を確認するか、地図から探索を始めてください。
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-m3-full bg-m3-primary px-6 py-3 text-label-lg font-semibold text-m3-on-primary"
        >
          トップに戻る
        </Link>
      </div>
    </div>
  );
}
