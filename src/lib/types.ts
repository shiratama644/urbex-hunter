export type SpotProperties = {
  spotcd: number;
  name: string;
  kana: string | null;
  address: string | null;
  prefecture: string | null;
  city: string | null;
  genre: string | null;
  status: string | null;
  phenomena: string[];
  features: string[];
  totalScore: number | null;
  nationalRank: number | null;
  prefRank: number | null;
  fearRating: number | null;
  ratingCount: number | null;
  outline: string | null;
  comment: string | null;
  imageUrl: string | null;
  sourceUrl: string;
  // Phase 3 拡張フィールド（後方互換: 既存 GeoJSON は undefined → null 扱い）
  nearestStation?: string | null;
  access?: string | null;
  surroundingFacilities?: string[];
  ghostTypes?: Record<string, number> | null;
  photoCount?: number | null;
  videoCount?: number | null;
  streetViewCount?: number | null;
  experienceCount?: number | null;
  commentCount?: number | null;
  updatedAt?: string | null;
  faq?: { q: string; a: string }[] | null;
};

export type SpotFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] }; // [lng, lat]
  properties: SpotProperties;
};

export type SpotCollection = {
  type: "FeatureCollection";
  count: number;
  truncated?: boolean;
  features: SpotFeature[];
};

export type SpotFacets = {
  total: number;
  genres: { value: string; count: number }[];
  prefectures: { value: string; count: number }[];
  phenomena: { value: string; count: number }[];
};

export const GENRE_EMOJI: Record<string, string> = {
  トンネル: "🚇",
  "ホテル・旅館": "🏨",
  "公園・城跡": "🏯",
  "湖（池）・ダム": "🌊",
  商業施設: "🏬",
  "山・森": "🌲",
  住居: "🏚️",
  橋: "🌉",
  "神社・寺": "⛩️",
  "川・滝": "💧",
  海: "🌅",
  "道・峠": "🛣️",
  "墓地・慰霊碑": "🪦",
  病院: "🏥",
  "駅・踏切": "🚉",
  学校: "🏫",
  遊園地: "🎡",
  "村・集落": "🏘️",
  樹木: "🌳",
  その他: "👻",
};

export const genreEmoji = (genre: string | null | undefined): string =>
  (genre && GENRE_EMOJI[genre]) || "👻";

/** 怖さ評価からトーナルカラー（危険度）を決定 */
export const fearTone = (rating: number | null | undefined) => {
  const r = rating ?? 0;
  if (r >= 4.2) return { label: "極度", bg: "#ffb4ab", fg: "#5a0f0a" };
  if (r >= 3.6) return { label: "高", bg: "#ffb3b0", fg: "#571d1f" };
  if (r >= 3.0) return { label: "中", bg: "#ffd8a8", fg: "#4a2800" };
  if (r > 0) return { label: "低", bg: "#9df2dd", fg: "#00382d" };
  return { label: "未評価", bg: "#cbc2d4", fg: "#312a3a" };
};
