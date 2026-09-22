# AGENTS.md — urbex-hunter

本ドキュメントは、AI Agent が本プロジェクトの開発・変更を行う際に**必ず遵守すべき開発規約**です。
最優先事項は **「速く大量に作ること」ではなく「常に復旧可能で、壊れた状態を長時間維持しないこと」** です。

本プロジェクトは **全国心霊マップ Explorer 👻** — 「全国心霊マップ (https://ghostmap.jp/)」
から収集した心霊スポットデータ（`data/spots.geojson` / PostgreSQL + Drizzle）を、
**Next.js 16 (App Router) + Tailwind CSS v4 (Material 3 Expressive) + Leaflet + markercluster**
で探索する非公式マップアプリです。**理想形の仕様正本は [`docs/arch/`](docs/arch/README.md)**
（入口 [`docs/arch/product.md`](docs/arch/product.md)）。免責とデータ帰属は [`docs/arch/legal.md`](docs/arch/legal.md)。

---

## 1. 基本方針 & 作業単位

### 1.1 基本原則
- **小さく実装 → 検証 → 修正 → Git Commit → 次の機能** のサイクルを徹底する。
- 一度に大量の機能を実装して最後にまとめてデバッグする方式は禁止。
- 「ついでに改善できそう」という理由でスコープを広げない（未指定の機能追加・設計変更・大規模リファクタリングの禁止）。

### 1.2 作業単位の粒度
1タスクは**「1つの意味のある論理的単位」**で区切る。

| 区分 | 例 |
| :--- | :--- |
| **良い例（適切な粒度）** | bbox フィルタの境界値テスト / scrape のリトライ分岐追加 / markerCluster の色分けしきい値調整 / facets 集計の N+1 解消 |
| **悪い例（細かすぎる）** | ボタン1個追加ごとにコミット / CSS margin変更ごとにテスト |
| **悪い例（大きすぎる）** | 地図 + スクレイパー + DB + API + フィルタUI を1タスクで一括実装 |

※データフロー（scrape → seed → API → Map）など広い変更は、「設計 → scrape → seed/DB → API → UI（各検証・commit）」と段階的に分割すること。

---

## 2. 開発ワークフロー

各タスクは必ず以下の順序で進め、途中の検証が失敗した状態で次へ進んではならない。

```text
1. 仕様・既存コード確認 (git status / package.json / 関連ファイル / docs/arch/ と docs/task-list.md)
   ↓
2. 実装方針決定（曖昧点は ask_user で確認）
   ↓
3. 実装 (最小限の差分)
   ↓
4. プロジェクト検証 (Lint / Typecheck / Build — §3.1)
   ↓ 失敗時は原因特定して修正し、再度全検証
5. 差分確認 (git diff で意図しない変更がないか確認)
   ↓
6. Git Commit (Conventional Commits形式)
   ↓
7. タスク完了・停止 (勝手に次のタスクを開始しない)
```

---

## 3. テスト・品質保証ルール

### 3.1 検証コマンドの実行
- `package.json` に定義されたスクリプトのみを使用する（存在しないコマンドを捏造・実行しない）。
- **パッケージ管理は npm**（`npm ci` / `npm run` / `npx`）。本テンプレートのロック期待は `npm`（`bun.lock` は使わない）。
- 原則として commit 前に以下を全て pass させる：
  ```bash
  npm run typecheck            # tsc --noEmit
  npm run lint                 # eslint . （flat config / next/core-web-vitals）
  npm run build                # next build
  ```
  - テストが追加された場合は `npm run test` / `npm run test:coverage` も対象に含める。
  - 現状 `package.json` に `test` が無い場合は捏造しない。追加する際は Vitest + @testing-library/react を候補にし、配置は `src/` に寄せるか `_tests_/` にミラーする方針を `docs/arch/testing.md` に記録してから導入する。
- **E2E（Playwright）は Sandbox で実行不可**（§6.2 参照）。`package.json` に `test:e2e` が無い限り捏造しない。CI 上のみ実行。
- ビルドサイズは `npm run build` 後に `.next/` / `out/` を確認する。Leaflet / framer-motion を含むため chunk 重複に注意。
- ドキュメントのみの変更（コード無変更）では上記はスキップ可。代わりに「リンク切れ・他ファイルとの参照整合・旧名称の残存がないこと」を grep 等で確認する。

### 3.2 エラー対応と品質維持
- エラー発生時はエラーメッセージやスタックトレースから根本原因を特定し、最小限の範囲で修正する。
- **テストを通すためだけの不正な修正は厳禁**：
  - テストの削除・スキップ・アサーションの緩和
  - 型エラーを回避するための安易な `any` 使用
  - Lintルールの勝手な無効化・エラーの握りつぶし
- **既存仕様の尊重**：既存テスト／API 契約が壊れた場合、「テストが間違っている」と即断せず、既存仕様を壊していないか確認する。

### 3.3 既存バグの扱い
- **今回のタスクを妨げるバグ**：必要最小限の修正を行う。
- **無関係な既存バグ**：勝手に修正せず、ユーザーに報告する（task-list.md に新タスクとして登録）。
- バグ修正時は、可能であれば再発防止の回帰テスト（Regression Test）を追加する。

---

## 4. Git運用 & 環境復旧ルール

Gitは単なる履歴管理ではなく、**「実行環境消失・セッション切断時の復元チェックポイント」**として扱う。

### 4.1 作業開始時の現状把握
作業開始時は必ず以下を実行し、ブランチ・未コミット変更・直近ログを確認する。
```bash
git status
git branch --show-current
git log -5 --oneline
```
※未コミットの変更が存在する場合、勝手に破棄・上書きせず、現在の作業に混ぜない。

#### 4.1.1 サンドボックス再構築時の復旧手順
Arena のサンドボックスは再構築されることがあり、その場合ワークツリーには「起点コミットのファイル」＋「push 済みコミットで追加されたファイルの未追跡バージョン」が混在した状態で立ち上がる（`git status` が「大量の削除 + 大量の未追跡」を示す）。この時点でファイルは破損していないので、以下の手順で確実に復旧すること。

```bash
# 1. リモートの最新を fetch（ブランチ名は `git branch --show-current` で確認した現在値を使う）
git fetch origin <session-branch>

# 2. FETCH_HEAD にワークツリーごとリセット（この場合の --hard は例外的に必要）
git reset --hard FETCH_HEAD

# 3. 依存を再構築
bash .agent/hooks/restore-sandbox-env.sh
```

- `git reset --hard FETCH_HEAD` は §4.3 の厳禁ルールの例外で、**サンドボックス再構築後の初回のみ**許可される（未コミット変更は元々存在しない状態のため）。
- 再構築を判定するヒント：`git log --oneline` が起点コミット 1 個しか返ってこない / `git status` が大量の削除を示す / node_modules がない / **依存が未インストール**。
- 復旧後は必ず `git log --oneline -5` と `npm run typecheck` 等で健全性を確認してから作業を再開する。
- 詳細手順は [`.agent/hooks/sandbox-rebuild-recovery.md`](.agent/hooks/sandbox-rebuild-recovery.md) ＋ [`.agent/hooks/restore-sandbox-env.sh`](.agent/hooks/restore-sandbox-env.sh)。

### 4.2 コミットルール
- **タイミング**: 検証（Lint/Type/Build）がすべてPASSした状態でのみコミットする。
- **事前チェック**: `git status` および `git diff` を確認し、意図しないファイルが含まれていないことを確認する。
- **重要な変更前のチェックポイント**: 大規模リファクタリング、scraper/DB スキーマ変更、地図ライブラリ更新の前には、作業前の正常状態を一度コミット（checkpoint）しておく。
- **コミットメッセージ**: Conventional Commits 形式に従う。
  - `feat:`, `fix:`, `refactor:`, `perf:`, `test:`, `docs:`, `chore:`, `build:`, `ci:`, `data:`
  - タスク ID がある場合はスコープに含める（例: `feat(API-1): bbox clamp`）。

### 4.3 厳禁なGit操作（明示的な指示がない限り実行禁止）
以下の破壊的・履歴改変コマンドは**絶対に実行してはならない**。
- `git reset --hard` / `git clean -fd`（未コミット作業の消失リスク）
  - ただし §4.1.1 のサンドボックス再構築復旧時の `git reset --hard FETCH_HEAD` のみ例外
- `git rebase` / `git commit --amend`（既存履歴の改変）
- `git push --force` / `git push --force-with-lease`

#### 4.3.1 通常の `git push` は**事前許可済み**（恒久ルール）
- **push のたびにユーザー確認を取らないこと。** §3.1 の検証がすべて PASS し、意図しない差分なしを確認できたら、その場で `git push origin <セッション固定ブランチ>` を実行する。
- **理由**: Sandbox は予告なく再構築され、**ローカルコミットのみだと作業が破棄される**。早急な復旧のため、成果物は常に origin へ上げておく。
- push 先は**セッション固定ブランチのみ**（§4.4）。`main` 等への直接 push、他ブランチへの push、force push は引き続き禁止。
- PR の作成も許可済み（`gh pr create`）。作成後は URL を報告する。
- push が失敗した場合の切り分けは §4.1.1 と「GitHub 接続の確認」を参照。認証エラーならユーザーに GitHub 再接続を依頼する。

### 4.4 ブランチ運用（本セッション固有ルール）
- **作業ブランチはセッション固定**。Arena はこのブランチ名でセッションを追跡しており、他ブランチに push した作業は**セッションと紐付かず失われる**。
  - ブランチ名は**セッションごとに変わる**ため、本ドキュメントの記載値を鵜呑みにせず **必ず `git branch --show-current` で確認**すること（pre-task フックの最初の手順）。
  - **過去セッションのブランチ名は本ドキュメントに残さない**。古いブランチ名を文書へ残すと、後続セッションが別セッションのブランチを fetch/push する事故になる。必要な情報は「毎回 `git branch --show-current` で確認する」という手順だけで十分。
- ユーザーから「別ブランチを使ってほしい」と依頼された場合も、セッション固定ブランチから離れる前に「このセッションは `<現在のブランチ名>` に固定です」と説明し、そのまま作業を続ける。
- feature branch は切らない。セッション固定ブランチへ直接 commit + push し、`gh pr create` で `main` 向け PR を作成する。マージ判断はユーザー側に委ねる。
- push は `git push origin <session-branch>` の明示指定で行う。default remote/branch 依存の `git push` は避ける。

### 4.5 docs/ と .agent/ の扱い
- ドキュメントと記憶システムは Git 追跡対象。ログ（`.agent/logs/`）は追加のみで過去ログを書き換えない（§8.5）。
- 旧プロジェクトから流用したアーカイブ等を新たに置く場合は `.archive/` 配下とし、ビルド・lint・テストの対象外にすること。

---

## 5. タスク完了条件（AI Agentの停止条件）

以下の条件が**すべて満たされた時点で作業を完了とし、停止（回答）**する。追加の改善を勝手に開始してはならない。

- [ ] 指定された機能/修正が実装されている
- [ ] すべての検証（Lint, Typecheck, Build）がPASSしている（ドキュメントのみ変更時は整合性確認で代替、§3.1）
- [ ] タスクと無関係なファイルの変更・意図しない差分がない
- [ ] 適切なメッセージで Git Commit が完了している
- [ ] Working tree が clean である（`git status` で確認）
- [ ] `git push origin <セッション固定ブランチ>` が完了している（§4.4）

---

## 6. プロジェクト固有の遵守事項

本プロジェクトで踏みやすい地雷と運用ルール。**計画書（`docs/planning/*PLAN.md`）に矛盾する指定があった場合は計画書を優先**する。計画書に無い事項は本節と [`docs/arch/`](docs/arch/README.md) を厳守する。**ADR（[`docs/arch/adr.md`](docs/arch/adr.md)）に反する実装はせず、人間に確認する。**

### 6.1 環境・ツールチェーン
- **ランタイム / パッケージ管理: Node.js 22 + npm**（`npm ci` / `npm run` / `npx`）。`bun` は使わない（本リポジトリは `nextjs-postgresql-template` 由来）。
  - Node バージョンは `.nvmrc` があればそれに追従。Sandbox 再構築時は [`.agent/hooks/restore-sandbox-env.sh`](.agent/hooks/restore-sandbox-env.sh) が npm 経由で依存を復旧する。
- **フレームワーク: Next.js 16 (App Router) + React 19 + TypeScript 5 (strict)**。`tsconfig.json` の `paths: { "@/*": ["./src/*"] }` を維持する。
  - `next.config.ts` は最小構成。必要な追加は `docs/arch/adr.md` に記録してから行う。
  - Server Component を原則とし、Leaflet 等ブラウザ専用は `dynamic(..., { ssr:false })` で分離する。
- **スタイリング: Tailwind CSS v4 + PostCSS**。`tailwind.config.ts` は置かない。トークンは `src/app/globals.css` の `@theme` ブロック（CSS-first）に集約する（[`docs/arch/ui.md`](docs/arch/ui.md)）。
  - M3 Expressive トークン（`--color-m3-*`, `--radius-m3-*`, `--shadow-m3-*`, `--ease-m3-*`）を勝手にリネームしない。
- **地図: Leaflet 1.9 + react-leaflet 5 + leaflet.markercluster**。CartoDB Dark Matter / Positron タイル。SSR しない。
  - 地図の状態（bbox/zoom/tile）は `GhostMapApp` が保持し、`MapClient` は表示に専念する。
  - クラスタリングの閾値やアイコン生成を変える場合は `docs/arch/ui.md` と合わせて更新する。
- **アニメーション: framer-motion**。M3 の spring / emphasized easing（`--ease-m3-*`）を使う。過剰な motion で地図操作を妨げない。
- **アイコン: lucide-react**。絵文字は `GENRE_EMOJI`（`src/lib/types.ts`）に集約。
- **DB: PostgreSQL + Drizzle ORM 0.45 + drizzle-kit**。スキーマは `src/db/schema.ts`（`spots` テーブル）が正本。マイグレーションは `drizzle.config.json` の `dialect: postgresql` を使う。
  - `spots.spotcd` が主キー。upsert は冪等に。index は `prefecture` / `genre` / `(lat,lng)`。
- **スクレイピング: cheerio + tsx**（`scripts/scrape.ts` / `scripts/seed.ts`）。出力は `data/spots.geojson`（FeatureCollection / 752件規模）。
  - 既存ファイルとマージする挙動を壊さない。並列度・待機・UA は [`docs/arch/scraping.md`](docs/arch/scraping.md) のポライトネス方針に従う。
- **Lint/Format: ESLint 9 (flat config)**。`eslint.config.mjs` は `eslint-config-next/core-web-vitals` + `globalIgnores([".next/**", ...])`。Prettier / Biome は使わない。
- **ビルド/Dev: `npm run dev` (next dev) / `npm run build` / `npm start`**。`postcss.config.mjs` は `@tailwindcss/postcss` のみ。
- arch に無い主要ライブラリを導入する場合はユーザーに相談する。

### 6.2 サンドボックス制約（乗り越えず、迂回する）

| 制約 | 対処 |
|---|---|
| **PostgreSQL が無い / `DATABASE_URL` 未設定** | `src/lib/spots-repo.ts` の `ensureSeeded()` が `data/spots.geojson` から自動シードする。DB 接続失敗は `tableReady()` / `createTableIfMissing()` のフォールバックで吸収する。ローカル検証は GeoJSON 直読みでも API 契約を満たすことを優先する。 |
| **ブラウザ / 地図の目視が限定的** | Leaflet の描画は Sandbox ではヘッドレス差がある。`MapClient` のロジック（bbox 計算・クラスタリング・フィルタ）は純粋関数として分離し、ユニットテスト可能にする。目視はプレビュー（`npm run dev` の 0.0.0.0 公開）で確認する。 |
| **外部ネットワークの一部到達不可（ghostmap.jp）** | 実 scrape は Sandbox で不安定。パース（cheerio）・座標抽出（`?q=lat,lng` 正規表現）・マージは純粋関数でテストする。実取得は「実環境検証待ち」と明記する。 |
| **GitHub API / 再取得の制限** | `scripts/scrape.ts` の `PREFS` / `LIMIT_PER_PREF` / `CONCURRENCY` を使った少量実行で検証する。本番の全47都道府県取得は週次 workflow で行う。 |

### 6.3 GitHub / CI
- **`.github/workflows/scrape_update.yml` は本リポジトリの正規ワークフロー**（週次 scrape + `data/spots.geojson` 更新 + 任意の DB sync）。変更時は差分と cron (`15 18 * * 0` = JST 月曜 03:15) を確認する。
- 新規 workflow を追加する場合は `docs/ops/` に提案を置くか、既存 workflow との重複（cron 競合・権限 `contents: write`）を ADR に記録してから `.github/workflows/` へ配置する。

### 6.4 UI / 地図 / アクセシビリティ
- **M3 Expressive を壊さない。** `src/app/globals.css` の `@theme` トークンを直接書き換える際は、必ず `docs/arch/ui.md` の「トークン一覧」と照合する。
- **FAB / Bottom Sheet / FilterPanel の責務を混ぜない。** `GhostMapApp` が状態の親、`MapClient` が地図、`SpotDetailSheet` が詳細、`FilterPanel` が絞り込みという境界を維持する。
- **レスポンシブ**：モバイルは Bottom Sheet（ドラッグで閉じる）、デスクトップはサイドパネル。`h-dvh` / `viewportFit: cover` を維持する。
- **`DisclaimerDialog` は初回訪問時の必須同意**（LocalStorage）。文言変更時は [`docs/arch/legal.md`](docs/arch/legal.md) と整合させる。

### 6.5 ESLint / TypeScript 固有ルール
- `eslint.config.mjs` は flat config。`globalIgnores` で `.next/**` / `out/**` / `build/**` / `next-env.d.ts` を除外する。`files.includes` 的な除外は書かない。
- `tsconfig.json` は `strict: true` / `noEmit` / `moduleResolution: bundler`。`baseUrl: "."` と `paths: { "@/*": ["./src/*"] }` を維持する。
- 型の `any` 逃げを禁止。`SpotFeature` / `SpotProperties` 等の domain 型は `src/lib/types.ts` が正本。

### 6.6 データ / API
- **スキーマ正本: `src/db/schema.ts`**。`spots` テーブルの列追加時は `drizzle-kit push` と `scripts/seed.ts` の upsert を同時に更新する。
- **API 契約: `src/app/api/spots/route.ts` / `[id]/route.ts` / `facets/route.ts` / `health/route.ts`**。クエリは `bbox` / `genre` / `pref` / `phenomenon` / `min_rating` / `q` / `limit`（[`docs/arch/api.md`](docs/arch/api.md)）。
  - `GET /api/spots` は `revalidate = 86400` + `Cache-Control: public, s-maxage=86400, stale-while-revalidate=604800`。変更時はキャッシュ戦略を ADR に記録する。
  - bbox は `minLng,minLat,maxLng,maxLat` の CSV。パース失敗は `undefined` 扱いで 500 にしない。
- **GeoJSON はソース・オブ・トゥルースの補助**。DB が空なら `ensureSeeded()` が `data/spots.geojson` から投入する（アドバイザリロックで多重実行防止）。
- **近隣検索**：`GET /api/spots/[id]` は対象 + 近隣4件を返す。距離計算の変更はテストを伴う。

### 6.7 スクレイピング / データ収集
- **対象は ghostmap.jp のみ**。他サイトへの拡張は ADR で合意してから。
- **ポライトネス**：同時接続 `CONCURRENCY=6` 程度、待機、UA (`GhostMapStudyBot`) を維持。サーバー負荷を上げる変更（並列度の大幅上げ・リトライ無限）は禁止。
- **抽出項目**：`spotcd` / 名称 / かな / 住所 / 都道府県 / 市区町村 / 緯度経度（`?q=lat,lng` 正規表現）/ ジャンル / 状態 / 心霊現象 / 特徴タグ / 総合得点 / 全国・県別ランク / 怖さ評価 / 評価人数 / 概要 / 代表コメント / 画像URL / 元記事URL。
- **出力**：`data/spots.geojson`（FeatureCollection）。既存とのマージでデータが蓄積される。`PREFS=13,27` / `LIMIT_PER_PREF` で部分実行できる。
- **投入**：`npx drizzle-kit push` → `npx tsx scripts/seed.ts`。本番への反映は `scrape_update.yml` の `Sync dataset into database` ステップ（`DATABASE_URL` secret がある場合のみ）。

### 6.8 ドキュメント運用
- **仕様書** = `docs/arch/`（[`docs/arch/README.md`](docs/arch/README.md) が目次）。
- **計画書** = `docs/planning/`（`_TEMPLATE.md` 準拠）。
- **進捗正本** = `docs/task-list.md`。
- **運用提案** = `docs/ops/`（CI / quality gate）。
- ファイル追加時は `docs/README.md` と `docs/arch/README.md` を更新する。
- Phase 番号は連番。サブタスク = 1 commit を原則。

### 6.9 計画書 > AGENTS.md の優先順位
- 計画書と本ドキュメントが食い違う場合、**計画書を優先**する。
- 計画書に無い事項は本節と `docs/arch/`（特に adr.md）。
- 計画書は着手前合意、AGENTS.md は作業の一般ルール。

### 6.10 計画書・タスク管理の形式（恒久ルール）
- **進捗管理の唯一の正本は `docs/task-list.md`**。タスクは ID（例: `MAP-1`, `API-2`）で管理し、状態（未着手/調査中/実装中/ローカル検証済み/実環境検証待ち/完了/保留/対象外）と完了条件・証拠（コミット SHA / テスト件数 / 実測値）を必ず記録・更新する。
- **新規計画書は `docs/planning/_TEMPLATE.md` の形式**（目的/変更範囲/禁止事項/完了条件/テスト方法/停止条件/完了時に行うこと + 設計詳細/Gotchas/実績）で作成する。
  出典: Qiita「Claude Code／Codex に中〜大規模開発を任せるためのタスク管理」
  <https://qiita.com/Y-Y-dev/items/d526fb7cdbe35a3f9384>
- タスク ID は一度発行したら再利用しない（中止は「対象外」+ 理由を残す）。
- 作業中に見つけた新問題は現在のタスクに混ぜず、task-list.md に新タスクとして登録する。
- 完了は AI の自己申告ではなく**証拠**（差分・テスト結果・実測値）で判定する。実環境（CI・実機・本番）での確認が残る場合は「実環境検証待ち」として 100% にしない。
- 原則として進行中タスクは 1 件。コミットメッセージにはタスク ID を含める。

### 6.11 法務・免責（必読）
- 本アプリは**非公式のファンプロジェクト**。データの著作権は全国心霊マップに帰属する。スクレイピング結果を商用再配布しない。
- UI 上の `DisclaimerDialog`・フッター等で**私有地侵入禁止・近隣配慮・自己責任**を明示する。文言を薄めない。
- 訪問を推奨・煽る表現（「肝試しに行こう」等）を追加しない。地図は「探索・閲覧」の位置づけに留める。
- 詳細は [`docs/arch/legal.md`](docs/arch/legal.md)。

---

## 7. コミュニケーション規約（Agent の話し方・ユーザーとの対話方針）

本節は「Agent がユーザーとどう会話するか」の型を定める。

### 7.1 返答の基本スタイル
- **言語**: 日本語（ユーザーが日本語で話しかけているため）。技術用語は日本語 + 英語併記可（例: 「z-index 序列」「bbox クランプ」「クラスタリング」）。
- **文体**: 敬体（です・ます調）をベース。技術説明部分は淡々と事実を述べる。過度な謙譲・冗長な前置きは避ける。
- **絵文字**: 通常会話では使わない。**結果報告・チェックリスト・優先度表示のみ**、最小限で使う。
  - `✅` (完了) / `❌` (失敗) / `🟡` (中優先度) / `🟢` (低優先度) / `🔴` (高優先度・要注意) / `🎉` (フェーズ完了時のみ)
- **見出し**: `##` `###` `####` で構造化。3 段以上は避ける。
- **表**: 実測値・比較・状態一覧は必ず表（`| 項目 | 値 |`）にまとめる。散文で羅列しない。
- **箇条書き**: `-` を優先。番号付き `1.` は手順・実行順序を示す時のみ。

### 7.2 報告のフォーマット
コミット・タスク完了時は以下の順序で報告する:
1. **見出し**: `## ✅ <タスク名> 完了 (<hash>)` のようにタスク名 + commit hash 短縮 7 桁
2. **変更内容の表**: `| # | 問題/目的 | 実装 |` 形式
3. **ファイル変更数**: `新規/変更ファイル (N files, +X / -Y)`
4. **検証結果チェックリスト**:
   ```text
   - ✅ npm run typecheck: 0 error
   - ✅ npm run lint: 0 error (N files)
   - ✅ npm run build: built in Xs
   - ✅ push 済み（`prev..head`）
   ```
5. **次のアクション**: 「次は何をしますか?」「Go を出していただければ〜」と提示、勝手に次のタスクを開始しない（§5 のタスク完了条件）。

### 7.3 事実と推測の分離
- 実測値・確認済み事実は断言する（「HTTP 200 でした」「バンドルは X KB になりました」）。
- 未検証・推測は明示する（「〜のはずです」「〜と想定」「〜見込み」）。
- 特に **地図の描画・パフォーマンス・スクレイピング件数** など **Sandbox で計測不能な数値** は「実機/本番で計測予定」等と明記し、確定値のように書かない。

### 7.4 ユーザーへの質問方針
**わからないこと・判断に迷うことは、勝手に決めず必ずユーザーに質問する**。

#### 7.4.1 質問すべき場面
- 実装方針が 2 通り以上あり、どちらもメリット・デメリットがある時
- 計画書 / `docs/arch/` に記載されていない仕様判断が必要な時
- ユーザーの過去発言と現在の指示が矛盾している疑いがある時
- 破壊的変更（API 契約変更、DB スキーマ変更、公開 URL 変更等）を含む時
- 「〜してください」の指示が曖昧で、複数解釈が成り立つ時

#### 7.4.2 質問の方法
- **`ask_user` ツール**を使う（自由文で質問文を投げるのではなく、選択肢 UI で提示）
- **選択肢は 2〜4 個 + 自由記述** に絞る。5 個以上は認知負荷が高くなり選ばれない
- 各選択肢には **短いラベル（`label`）** と **詳しい説明（`description`）** を書く
- 質問文は 1 文で明確に。前置きは最小限
- **一度に 4 質問まで**

### 7.5 Web 検索の活用方針
**わからないこと・記憶に自信がないことは Web 検索で確認する**。特に Next.js / Leaflet / Drizzle / Tailwind 等、メジャーバージョン更新が速い領域は検索必須。

- `web_search` ツールを使う。`depth` は状況で使い分け: depth=1（事実確認）/ depth=2（標準・複数ソース比較）/ depth=3（深掘り）。
- 検索結果を引用する時は `[id](url)` 形式で必ずソースを明示。公式ドキュメント（nextjs.org, leafletjs.com, orm.drizzle.team 等）を優先。
- **記憶で断言せず、疑わしければ検索する**（ハルシネーション回避）。
- **技術的事実の確認** → `web_search`（客観情報）/ **プロジェクト固有の仕様判断** → `ask_user`（ユーザー主観）。

### 7.6 失敗・エラー時の対応スタイル
検証失敗・実装エラーが発生した時は、以下の 3 段で説明する:
1. **原因分析**: 「〜が原因です」（推測なら「〜と思われます」を明示）
2. **修正方針**: 「〜で対処します」（2 案以上あるならユーザーに選択させる）
3. **実装**: 実際の修正コード

原因を隠して修正だけ通知しない。ユーザーが同じ地雷を踏まないよう、原因もセットで共有する。

### 7.7 制約・リスクの事前明示
実装前に **サンドボックス制約・GitHub 権限・ブラウザ/ネットワーク制約 等**が関係する場合は必ず先に伝える。

例:
> この機能は `ghostmap.jp` への実 scrape が必要ですが、**Sandbox は外部ネットワークが限定的**（§6.2）なので、ローカルではパースと GeoJSON マージまで検証し、実取得は週次 workflow（実環境検証待ち）で確認します。

事後報告（「実は動作確認できてませんでした」）は信頼を損なうので避ける。

---

## 8. エージェント記憶システム（`.agent/`）

本プロジェクトでは、Agent 自身の**スキル（このプロジェクトをうまく進めるためのノウハウ・テクニック・手順・パターン）**、定型ワークフロー、タスク実行ログを `.agent/` 配下に構造化して永続化する。セッションをまたいで能力を継承し、無駄な再調査・失敗を省くための仕組み。

- **`skills/` は Agent のスキルそのもの**。「このプロジェクトで何をどうやるとうまくいくか」という実践的な能力・コツ・手順・パターン・コードベース知識を貯める場所で、**仕様書の要約メモではない**。設計仕様の正本は `docs/arch/` にあり、スキルはそれを踏まえつつ「実際に手を動かすやり方」を持つ。

### 8.1 ディレクトリ構成

| ディレクトリ | 役割 | 命名規則 |
| :--- | :--- | :--- |
| `.agent/skills/` | **Agent のスキル**: このコードベース・この開発をうまく進めるためのノウハウ・テクニック・手順・パターン・コードベース知識 | `<kebab-case>/SKILL.md` |
| `.agent/hooks/` | トリガー別の**定型手順/スクリプト**（pre-task, verify, log, recovery） | `kebab-case.md` / `.sh` / `settings.json` |
| `.agent/logs/` | タスク完了毎の**実行記録** | `YYYY-MM-DD_kebab-case-summary.md` |

各ディレクトリ直下に **`index.md`** を置き、一覧・参照条件を管理する（logs は除く）。

> ディレクトリ構造は Claude Code 準拠。**skills** は各スキルを `<スキル名>/SKILL.md` フォルダで持ち（`SKILL.md` 冒頭に `name` / `description` の YAML frontmatter）、**hooks** は実行スクリプト（`.sh`）を `.agent/hooks/` に置き、トリガー登録を [`settings.json`](.agent/hooks/settings.json)（Claude Code の `hooks.<event>` と同型）で行う。

### 8.2 `index.md` 起点のピンポイント読込（核心ワークフロー）
- **タスク開始時**（[`.agent/hooks/pre-task.md`](.agent/hooks/pre-task.md)）: 現状把握後、[`.agent/skills/index.md`](.agent/skills/index.md) の「読み方ガイド」で**該当スキルだけ**を読む。全スキルを常に読み込まない（コンテキスト浪費）。
- **トリガー発生時**: [`.agent/hooks/index.md`](.agent/hooks/index.md) の「対応表」で該当フックを特定し実行。
- 初回/全体把握が必要な時だけ `skills/project-overview/SKILL.md` → `skills/tech-stack/SKILL.md` の順。

### 8.3 記憶の同期（書き込みワークフロー）
- **タスク完了時**（[`.agent/hooks/log-task.md`](.agent/hooks/log-task.md)）: 必ず `.agent/logs/YYYY-MM-DD_<summary>.md` を 4 セクション（指示内容/実行内容/気づき/次アクション）で作成。
- **知見のスキル化**: ログの「気づき」が再利用性の高いコードベース知識なら該当 `skills/*/SKILL.md` に反映し、`skills/index.md` の「最終更新」を更新する。新スキルは `skills/index.md` の「読み方ガイド」「一覧」両方に追記。
- ログ・スキル・index の変更も commit/push 対象（セッションブランチへ）。

### 8.4 AGENTS.md / skills / docs/arch の役割分担
- **AGENTS.md（本ファイル）** = 「どう作業するか」の**規約**（コミット手順・Lint・Git 運用・コミュニケーション等）。常に正。
- **`.agent/skills/`** = **Agent のスキル**。「このプロジェクトでうまくやるためのノウハウ・テクニック・手順・パターン」。実際に手を動かすための実践的な能力であり、仕様書の要約ではない。必要なら仕様書（docs/arch）を参照・引用する。
- **`docs/arch/`** = 設計**仕様書**の正本（技術選定・プロトコル・アーキテクチャ・設計ルール）。
- 役割の違い: 「こういう設計になっている」が仕様書（docs/arch）、「こうやるとうまく作れる/ハマらない」がスキル（skills）、「こう作業せよ」が規約（AGENTS.md）。矛盾時は §6.9（計画書優先）に従う。

### 8.5 運用ルール
- `.agent/` 配下は Git 追跡対象（永続化）。`.gitignore` で除外しない。
- スキル/フックを更新したら対応 `index.md` も必ず更新する（腐らせない）。
- ログは**追加のみ**（過去ログを書き換えない）。
  - ⚠️ **一括置換・リネーム系の指示が来ても、`.agent/logs/` の過去ログを置換対象に含めない。** 過去ログは「その時点で何が起きたか」の事実記録であり、旧ブランチ名・旧数値・旧パスが書かれているのは**正しい状態**。書き換えると記録が偽になる。
  - 一括置換の射程は**現用ドキュメント**（`AGENTS.md` / `.agent/skills/` / `.agent/hooks/` / `docs/` の現用ファイル）に限定する。`.agent/logs/` と `docs/audit/` の時点記録に触れる必要がある場合は、**必ず事前にユーザーへ確認**する。
  - 当時の事実（旧ブランチ名など）を残す必要がある場合は、過去ログを書き換えるのではなく**当日の新規ログに記録**する。
