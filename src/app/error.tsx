"use client";

import { useEffect } from "react";

// biome-ignore lint/suspicious/noShadowRestrictedNames: Next.js requires `Error` as default export name
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="grid h-dvh place-items-center bg-m3-surface-dim p-6 text-center">
      <div className="max-w-md rounded-m3-xl bg-m3-surface-container-high p-8 shadow-m3-3">
        <h1 className="text-title-lg font-semibold text-m3-on-surface">読み込みに失敗しました</h1>
        <p className="mt-2 text-body-md text-m3-on-surface-variant">
          一時的なエラーです。時間を置いて再度お試しください。
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-6 rounded-m3-full bg-m3-primary px-6 py-3 text-label-lg font-semibold text-m3-on-primary"
        >
          再試行
        </button>
      </div>
    </div>
  );
}
