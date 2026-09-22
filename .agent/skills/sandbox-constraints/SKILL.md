---
name: sandbox-constraints
description: Sandbox / ブラウザ・ネットワーク / DB の恒常的制約と迂回策。環境トラブル時に参照。
---

# Sandbox Constraints — 環境制約と迂回策

> AGENTS.md §6.2 の実態版。「乗り越える」のではなく「迂回する」。制約は修正対象ではない。

## 恒常的制約

| 制約 | 影響 | 対処 |
| :--- | :--- | :--- |
| **PostgreSQL が無い / DATABASE_URL 未設定** | `src/lib/spots-repo.ts` の DB 経路が失敗する | `ensureSeeded()` の GeoJSON フォールバックを壊さない。`tableReady()` / `createTableIfMissing()` の分岐を維持する。ローカル検証は `querySpots` が GeoJSON からでも契約どおりの `SpotCollection` を返すことを優先する。 |
| **Chromium バイナリの install 不可** | Playwright E2E がローカルで実行できない | E2E は書けるが Sandbox では browser 実行を捏造しない。`package.json` に `test:e2e` が無い間は追加しない。追加時は `docs/planning/` で合意してから CI でのみ実行する。 |
| **外部ネットワークの一部到達不可（ghostmap.jp）** | 実 scrape がタイムアウト / 403 | ローカルでは `PREFS=13 LIMIT_PER_PREF=5` の少量で試す。パース（cheerio）・座標抽出（`?q=lat,lng` regex）・マージは純粋関数でユニットテストする。実取得は「**実環境検証待ち**」と明記する。 |
| **Leaflet のヘッドレス差** | 地図のピクセル目視が Sandbox では限定的 | `MapClient` を `dynamic ssr:false` に分離し、bbox 計算・フィルタ・クラスタリング閾値は純粋関数でテストする。目視は `npm run dev` のプレビュー（0.0.0.0）で確認する。 |
| **.next キャッシュの肥大化** | `npm run build` が遅くなる | `npm run build` 前に `.next` を消す場合は `git clean -fdx .next` ではなく `rm -rf .next` に留める（§4.3 の `git clean -fd` 厳禁）。 |

## アプリ固有の迂回パターン

- **DB**: `querySpots` / `getFacets` は DB 失敗時に GeoJSON へフォールバックする。テストでは `db` をモックし、`readGeoJson()` の分岐をカバーする。`spots` テーブルが無い状態でも `createTableIfMissing()` が DDL する。
- **スクレイピング**: `scripts/scrape.ts` の `PREFECTURES` ループは純粋関数に切り出せる部分（URL 生成・正規表現・Feature 生成）を分離してテストする。実ネットワークは実環境（週次 workflow）で確認する。
- **地図**: `GhostMapApp` の `bbox && zoom >= 8` 分岐や `genreEmoji` / `fearTone` はユニットテストしやすい。`MapClient` の Leaflet 初期化は jsdom でレンダリングしない。
- **API キャッシュ**: `revalidate = 86400` と `s-maxage` は Next.js の ISR。Sandbox では `fetch` のキャッシュ挙動をモックして分岐を確認する。実 CDN は実環境検証待ち。

## 復旧手順

- Sandbox 再構築時（`git log` が起点 1 件のみ / 大量削除+未追跡 / node_modules 無）は [`.agent/hooks/sandbox-rebuild-recovery.md`](../../hooks/sandbox-rebuild-recovery.md) ＋ [`restore-sandbox-env.sh`](../../hooks/restore-sandbox-env.sh)。
- `npm run build` 後のバンドルは `ls -lh .next/static` で確認（Leaflet + framer-motion を含む。重複依存・chunk 分割に注意）。DB 無しでも GeoJSON 経路で `next build` が通ることを確認する。
