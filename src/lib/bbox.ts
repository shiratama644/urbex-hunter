export type Bbox = [number, number, number, number];

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** bbox を -180..180 / -90..90 に clamp する（GhostMapApp の pad 後の正規化用） */
export function clampBbox(b: Bbox): Bbox {
  return [
    clamp(b[0], -180, 180),
    clamp(b[1], -90, 90),
    clamp(b[2], -180, 180),
    clamp(b[3], -90, 90),
  ];
}

/**
 * bbox 文字列を clamp + 正規化する
 * 事実: 経度 -180..180 / 緯度 -90..90 に clamp し、逆転を正規化する（EM1-B）
 */
export function parseBbox(raw: string | null): Bbox | undefined {
  if (!raw) return undefined;
  const parts = raw.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return undefined;
  let [a, b, c, d] = parts;
  if (a > c) [a, c] = [c, a];
  if (b > d) [b, d] = [d, b];
  return [clamp(a, -180, 180), clamp(b, -90, 90), clamp(c, -180, 180), clamp(d, -90, 90)];
}
