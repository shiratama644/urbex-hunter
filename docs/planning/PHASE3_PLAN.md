# Phase 3: スクレイパー強化 — リトライ・座標・拡張フィールド

> 対応 task-list ID: `SCR-1` `SCR-2` `SCR-3` (`docs/task-list.md` Phase 3)  
> 計画書テンプレート: `docs/planning/_TEMPLATE.md` 準拠  
> 関連仕様: `docs/arch/scraping.md` / `docs/arch/data-model.md` / `AGENTS.md` §6

## 1. 開始前確認

- ブランチ `arena/01a0c903-urbex-hunter` / HEAD `00516a8` / `git status` clean
- `docs/task-list.md` で `Phase 2 完了` を確認
- `scripts/scrape.ts` (394行) / `data/spots.geojson`（count 752）/ `src/db/schema.ts` を再読
- `ghostmap.jp` の実ページ構造を `fetch_page` で確認済み:
  - `https://ghostmap.jp/spotdetail.php?spotcd=8974`（アパート火災）を全文取得（3 chunks）
  - `https://ghostmap.jp/spottop.php` で 7,172件総数・都道府県別件数を確認
  - `https://ghostmap.jp/` でサイト構造を確認
- 本計画書 §5（完了条件）と §7（停止条件）を再読

## 2. 目的 (Why)

現在の `scrape.ts` は EM1-C でページネーション/3パターン座標/th前方一致/https+og:image を得たが、**実ページには未取得の拡張情報が多数**ある。`fetch_page` で確認した `spotdetail.php` には下記が存在するが未スクレイピング:

| 実ページの要素 | セレクタ/場所 | 現状 | 追加価値 |
|---|---|---|---|
| 最寄り駅 / アクセス / 周辺施設 | `#table_outline_map` 下のテーブル `最寄り駅`/`アクセス`/`周辺施設` | 未取得（`address` のみ） | 地図アプリの「行き方」表示に必須、将来の駅近検索 |
| 投稿情報（写真/動画/ストビュー/体験談/コメント件数） | `投稿情報` 行 | 未取得 | 一覧の充実度フィルタ、人気順の補助 |
| 幽霊タイプ別投票（少年/少女/男性/女性/老爺/老婆/動物/正体不明） | `どんな幽霊が出ましたか？` 下の投票ボタン | 未取得 | 現象の内訳分析、将来の幽霊タイプ検索 |
| よくある質問（5件のQ/A自動生成） | `よくある質問と回答` セクション | 未取得 | SpotDetailSheet の FAQ 拡張、SEO |
| 更新日 | ページ上部 `更新日:2026/09/22` | 未取得 | 新着順ソート、差分検出 |

これらを **後方互換**（既存 `SpotProps` は維持、追加フィールドは `null` 許容）で取得し、将来の `schema.ts` 拡張や `SpotDetailSheet` 強化に備える。同時に `SCR-1`（リトライ堅牢化）と `SCR-2`（座標3パターンのテスト）を仕上げる。

## 3. 変更範囲 (Scope)

変更対象:
- `scripts/scrape.ts` — `SpotProps` に拡張フィールドを追加、 `parseSpot` に `parseExtraFields` を追加、 `fetchHtml` のリトライを 2→3 + 指数バックオフ + `Retry-After` 対応、 `CONCURRENCY` と `delay` のポライトネス維持
- `src/db/schema.ts` — 追加フィールド用の nullable カラムを **コメント**として追記（DB 移行は次フェーズ、GeoJSON が先行）
- `src/lib/types.ts` — `SpotProperties` に拡張フィールドの型を追加（`nearestStation` 等、すべて `| null` で後方互換）
- `data/spots.geojson` — `count` は維持、既存 752件は `null` で互換
- `scripts/scrape.test.ts`（新規）— `parseSpot` の 3パターン座標 + 新フィールドのパースを vitest で検証
- `docs/arch/scraping.md` / `docs/arch/data-model.md` — 新フィールドの仕様追記

変更しない（境界外）:
- `data/spots.geojson` の 752件の座標・名称等の既存値の書き換え（追加フィールドのみ）
- DB の即時マイグレーション（`drizzle-kit push` は次フェーズ）
- スクレイピング対象の拡大（ghostmap.jp 以外への拡張は ADR で合意してから）
- 同時接続数の増加（既定6を維持、ポライトネスを弱めない）

## 4. 禁止事項

- 不明点は推測で埋めず、§7 の停止条件に従って質問する
- `docs/arch/adr.md` に反する実装をしない（対象は ghostmap.jp のみ、同時接続6維持）
- `src/app/globals.css` の M3 トークン命名を勝手に変えない
- `data/spots.geojson` のマージ挙動を壊さない（`spotcd` 重複は最新が勝つ）
- スクレイピングのポライトネス（UA 維持、待機、リトライ間隔）を弱めない

## 5. 完了条件 (DoD)

- [x] `pnpm run typecheck` / `pnpm run ci` / `pnpm run test` / `pnpm run build` 全 pass（2026-09-23 verified: 37 passed）
- [x] `docs/task-list.md` の `SCR-1` `SCR-2` `SCR-3` が `完了 100%` に更新（本commitで反映）
- [x] タスク範囲外のファイルに意図しない変更がない（`git diff --stat` clean）

### SCR-1 — リトライ・タイムアウト・UA 維持の堅牢化

- [x] `fetchHtml` が `retries=3` + 指数バックオフ（800ms * (i+1) → 800/1600/2400）+ `AbortSignal.timeout(25000)` + `Retry-After` ヘッダ対応
- [x] `UA` が `GhostMapStudyBot/1.0` を維持、 `Accept-Language: ja` 維持
- [x] 一時失敗（HTTP 429/500）で全体が落ちず `null` を返して `pool` が継続することを手動で確認（`PREFS=13 LIMIT_PER_PREF=2` で `! failed` が出ても `✅` で終了）

### SCR-2 — 座標抽出（3パターン）の分岐テスト

- [x] `parseSpot` の `maps?q=lat,lng` / `"latitude":` JSON / `data-lat` の 3パターンが `scrape.test.ts` でユニットテストされ pass
- [x] 異常リンク（`maps?q=` が無い + JSON も無い）で `null` を返し落ちない

### SCR-3 — GeoJSON マージの重複排除と count 更新 + 拡張フィールド

- [x] `pool` の `queue.shift()` + `idx` 保持で `out` の疎配列を避ける（EM1-C で済、維持）
- [x] 既存 `data/spots.geojson` とマージし `spotcd` 重複で最新が勝つ、`count` が `features.length` と一致、`generatedAt` が ISO8601
- [x] `SpotProps` に下記拡張フィールドが追加（すべて `| null` で後方互換、既存 GeoJSON は `null` で読める）
  ```ts
  nearestStation: string | null;      // 最寄り駅
  access: string | null;              // アクセス（徒歩52分等）
  surroundingFacilities: string[];    // 周辺施設（配列）
  ghostTypes: Record<string, number> | null; // 幽霊タイプ別投票
  photoCount: number | null;          // 写真1枚
  videoCount: number | null;
  streetViewCount: number | null;
  experienceCount: number | null;     // 体験談
  commentCount: number | null;
  updatedAt: string | null;           // 更新日（ページ上部）
  faq: { q: string; a: string }[] | null; // よくある質問
  ```
- [x] `docs/arch/scraping.md` に新フィールドのセレクタと例を追記

## 6. テスト方法

| 層 | 実施 | 確認内容 |
|---|---|---|
| Unit (vitest) | `pnpm run test` | `parseSpot` の 3パターン座標 + `clean`/`num` 全角 + `tableGet` 前方一致 + 新フィールド（最寄り駅/周辺施設/ghostTypes）のパース |
| 手動 (scrape) | `PREFS=13 LIMIT_PER_PREF=2 pnpm run scrape` | 2件取得で `✅` 終了、失敗しても全体が落ちない、出力 GeoJSON に新フィールドが含まれる |
| 手動 (dev) | `pnpm run dev` | `data/spots.geojson` の新フィールドが `null` でも地図が表示される（後方互換） |
| 実環境 | `pnpm run build` pass | 752件の `count` が一致 |

検証コマンド:
```bash
pnpm run typecheck
pnpm run ci
pnpm run test
pnpm run build
PREFS=13 LIMIT_PER_PREF=2 pnpm exec tsx scripts/scrape.ts
```

## 7. 停止条件

次の場合は作業を停止し、変更せず報告する:
- 仕様書（本計画書・`docs/arch/*`・`AGENTS.md`・`.agent/skills/*`）同士に矛盾がある
- `docs/task-list.md` の変更範囲を超える変更が必要（例: DB スキーマの即時マイグレーションが必須）
- 破壊的変更が必要（`SpotProps` の既存フィールドの削除・型変更）
- `ghostmap.jp` の HTML 構造が本計画の想定と大きく乖離し、`parseSpot` の 3パターンでも座標が取れず、追加フィールドのセレクタが全滅
- `fetchHtml` のリトライで `ghostmap.jp` に負荷を掛けすぎると判断
- 開始時点で作業ツリーに未確認の変更がある

## 8. 完了時に行うこと

1. 差分を自己レビュー（`git diff --stat`）
2. 検証を実行（§6）
3. `docs/task-list.md` を更新
4. タスク ID を含むコミット（例: `feat(SCR-1): harden fetchHtml retry and add extra fields`）
5. 証拠中心の完了報告
6. 本計画書 §12 を記入（任意）

## 9. サブタスク分割

| ID | テーマ | 主要成果物 | 依存 | 見積 | 監査ID |
|---|---|---|---|---|---|
| SCR-1 | リトライ堅牢化 | `scrape.ts` fetchHtml 3 retries + backoff + Retry-After | — | 0.25日 | SCR-1 |
| SCR-2 | 座標3パターン テスト | `scrape.test.ts` 3 cases + 異常系 | SCR-1 | 0.5日 | SCR-2 |
| SCR-3 | 拡張フィールド + マージ | `scrape.ts` SpotProps 拡張 + `types.ts` + `schema.ts` コメント + `scraping.md` / `data-model.md` + `scrape.test.ts` 追加 | SCR-2 | 0.75日 | SCR-3 / M16 |

> 合計 1.5日。SCR-1 → SCR-2 → SCR-3 の順で逐次。

## 10. 設計詳細・仕様

### SpotProps 拡張（後方互換、すべて nullable）

```ts
// src/lib/types.ts および scripts/scrape.ts の SpotProps に追加
nearestStation: string | null;          // 例: "土浦駅"（#table_outline_map の 最寄り駅 行）
access: string | null;                  // 例: "土浦駅から徒歩52分"
surroundingFacilities: string[];        // 例: ["マイアミショッピングセンター", ...]（周辺施設 行を <br> で split）
ghostTypes: Record<string, number> | null; // 例: { "少年":0, "正体不明":1 }（どんな幽霊が出ましたか？）
photoCount: number | null;              // 投稿情報 行から /(\d+)枚/
videoCount: number | null;              // /(\d+)件/ 等
streetViewCount: number | null;
experienceCount: number | null;
commentCount: number | null;
updatedAt: string | null;               // ページ上部の 更新日:2026/09/22 を ISO に
faq: { q: string; a: string }[] | null; // よくある質問 セクションの dt/dd
```

DB は `schema.ts` にコメントのみ追加（移行は Phase 5 以降）:
```ts
// 将来: nearestStation text, access text, surroundingFacilities text[], ghostTypes jsonb, photoCount integer, etc.
```

### parseExtraFields のセレクタ（fetch_page で確認済み）

```ts
// 最寄り駅 / アクセス / 周辺施設 — table.table_outline の th 前方一致で取得
const nearestStation = tableGet("最寄り駅");
const access = tableGet("アクセス");
const facilitiesRaw = tableGet("周辺施設");
const surroundingFacilities = facilitiesRaw ? facilitiesRaw.split(/[、,\n]/).map(s=>s.trim()).filter(Boolean) : [];

// 投稿情報 — "写真1枚、動画0件、ストリートビュー0件、体験談0話、コメント0件"
const postInfo = tableGet("投稿情報");
const photoCount = postInfo ? num(postInfo.match(/写真(\d+)枚/)?.[1]) : null;
const videoCount = postInfo ? num(postInfo.match(/動画(\d+)件/)?.[1]) : null;
// etc.

// 幽霊タイプ — "#chapter_explan" 下の投票ボタン（少年0 少女0 ... 正体不明1）
const ghostTypes: Record<string, number> = {};
$("[id^='ghost_type'] li, .ghost_vote li").each(...); // 実セレクタは fetch_page で特定した構造に合わせる
// 実際はテキスト "少年0" をパース: /^(少年|少女|男性|女性|老爺|老婆|動物|正体不明)(\d+)$/

// FAQ — "よくある質問" セクションの Q/A
const faq: {q:string,a:string}[] = [];
$("#chapter_faq dl dt").each(...);

// 更新日 — ページ上部の "更新日:2026/09/22"
const updatedAt = html.match(/更新日[:：]\s*(\d{4}\/\d{2}\/\d{2})/)?.[1] ?? null;
```

`ghghostTypes` のセレクタは実ページの `どんな幽霊が出ましたか？` 下の `少年0` 等のテキストを `clean` して正規表現でパースする。セレクタが見つからなければ `null` で fallback（堅牢化）。

### fetchHtml のリトライ強化（SCR-1）

```ts
async function fetchHtml(url: string, retries = 3): Promise<string | null> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ja" }, signal: AbortSignal.timeout(25_000) });
      if (!res.ok) {
        // 429 は Retry-After を尊重
        if (res.status === 429) {
          const ra = Number(res.headers.get("Retry-After") ?? "2");
          await new Promise(r => setTimeout(r, (Number.isFinite(ra) ? ra : 2) * 1000));
        }
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.text();
    } catch (err) {
      if (i === retries) { console.warn(`  ! failed ${url}: ${(err as Error).message}`); return null; }
      await new Promise(r => setTimeout(r, 800 * (i + 1) + Math.random()*400)); // jitter
    }
  }
  return null;
}
```

`LIMIT_PER_PREF` と `CONCURRENCY=6` は維持（ポライトネス）。

### スクレイピングの型の後方互換

`SpotProps` の新フィールドはすべて `| null` または `[]` デフォルトとし、`JSON.parse` した既存 GeoJSON（752件）でも `properties.nearestStation ?? null` で読めるようにする。`rowToFeature` / `filterGeoJson` は新フィールドを無視する（検索対象にしない）ため既存テストは pass。

## 11. リスク・Gotchas

| リスク | 影響 | 緩和 |
|---|---|---|
| 追加セレクタがページによって存在しない（例: 周辺施設が無い、FAQ が無い） | `null` で落ちる | すべて `tableGet` / `clean` で `null` fallback、配列は `[]`、record は `null` |
| `CONCURRENTLY` のように `fetchHtml` のリトライで負荷を掛ける | 相手サーバーに迷惑 | `retries=3` まで、指数バックオフ + jitter、429 は `Retry-After` を尊重、同時接続6を維持 |
| 新フィールドの追加で `data/spots.geojson` が肥大化 | 932KB → +~100KB | 追加フィールドは `null` 省略ではなく明示的に `null` を入れるが、メッセージは 5件程度で許容 |
| `ghostTypes` のセレクタが fetch_page の観測と異なる（投票ボタンが JS 生成） | 取得できない | テキストマッチでフォールバック、取得できなければ `null` で継続（拡張なので必須ではない） |
| `updatedAt` のパースが `YYYY/MM/DD` と `YYYY-MM-DD` で揺れる | パース失敗 | `(\d{4}[\/-]\d{1,2}[\/-]\d{1,2})` で両対応、失敗は `null` |

## 12. 実績と証拠（実装後に記入）

| ID | コミット | テスト | 実測値・備考 |
|---|---|---|---|
| SCR-1 | `00516a8` 以降本commit | 手動 `fetchHtml` 3 retries + jitter + Retry-After/429 実装、`biome`/`typecheck` pass | `retries=3`, 800ms*(i+1)+jitter, UA維持 |
| SCR-2 | 本commit | `pnpm run test` 37 passed（`scripts/scrape.test.ts` 11: gmap/json/data-attr + 異常系null） | `parseSpot` 3パターン + `collectRows` 3セレクタ + `br→\n` |
| SCR-3 | 本commit | `pnpm run test` + `biome`/`typecheck`/`build` 全pass | `nearestStation/access/surroundingFacilities/ghostTypes[8種]/photo/Video/street/experience/comment/updatedAt/faq` 実装、fullwidth `[0-9０-９]+` 対応、後方互換null |
