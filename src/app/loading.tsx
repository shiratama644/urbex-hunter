export default function Loading() {
  return (
    <div className="grid h-dvh place-items-center bg-m3-surface-dim">
      <div className="flex flex-col items-center gap-3 text-m3-on-surface-variant">
        <div className="size-8 animate-spin rounded-full border-4 border-m3-outline-variant border-t-m3-primary" />
        <p className="text-body-md">地図を召喚中...</p>
      </div>
    </div>
  );
}
