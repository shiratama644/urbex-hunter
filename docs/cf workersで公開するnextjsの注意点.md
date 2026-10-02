<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# CloudflareでNextJSサイトを公開するときの注意点をおしえて。そのサイトにはPostgresqlがある(Neonで運用)。SSRあり。

CloudflareでSSR付きNext.jsを公開する場合、**Pagesの静的ホスティングではなく、基本的にCloudflare Workers向けにデプロイする**のが重要です。Neon PostgreSQLは利用できますが、接続方式・リージョン・キャッシュ・Node.js互換性を先に確認してください。

## 1. Pagesの静的設定を使わない

Next.jsにSSR、Server Actions、Route Handlers、Middlewareなどがある場合、Pagesの「Next.js (Static HTML Export)」設定では対応できません。これは `output: "export"` を使う静的サイト用です。

現在のCloudflare公式の推奨ルートは、既存のNext.jsアプリに **vinext** を導入してWorkersへデプロイする方法です。SSR、React Server Components、Server Actions、Route Handlers、ISRなどがサポートされています。ただし、vinextは現時点でBetaなので、必ず互換性チェックを行ってください。[^1_1]

```bash
npx vinext check
npx vinext init
npm run build:vinext
npx @vinext/cloudflare deploy
```

既存プロジェクトでvinextの互換性に問題がある場合は、`@opennextjs/cloudflare`を使う選択肢もあります。OpenNextはSSR対応ですが、Cloudflareは新規アプリにはvinextを推奨しています。[^1_2][^1_3]

## 2. Node.js APIの互換性を確認する

Cloudflare Workersは通常のNode.jsサーバーとは異なり、常駐プロセスや任意のTCPソケットを前提にしたコードがそのまま動くとは限りません。

特に次を確認してください。

- `fs`、`net`、`tls`、`child_process`などを直接使うパッケージ。
- Node.js専用の画像処理、暗号化、ファイル操作ライブラリ。
- サーバー起動時に常駐する処理。
- `process.env`へ直接依存するコード。
- 長時間実行する処理や大きなファイル生成。
- Node.js用のPostgreSQLクライアントを、Workersの通常環境で直接使う構成。

OpenNextではNode.js互換性を利用できますが、すべてのNode.js APIが通常のサーバーと同じになるわけではありません。まずローカルのNode.js実行だけでなく、WranglerによるWorkersランタイム上のプレビューも確認してください。[^1_3]

## 3. NeonはHyperdriveを第一候補にする

Neon PostgreSQLとの接続は、次の2方式が現実的です。


| 方式 | 向いているケース | 注意点 |
| :-- | :-- | :-- |
| Cloudflare Hyperdrive + `pg` / Postgres.js | 本番、複数クエリ、ORM利用、トラフィックが多い場合 | Hyperdrive用に直接接続文字列を登録する |
| `@neondatabase/serverless` | 単発クエリ、軽量なAPI、構成を簡単にしたい場合 | トランザクションや接続管理に制約がある |

CloudflareとNeonの公式ドキュメントでは、Hyperdriveが推奨されています。HyperdriveがCloudflare側で接続プールとDB接続を管理するため、WorkersからNeonへ接続する際のレイテンシーや接続数の問題を抑えやすくなります。[^1_4]

### Hyperdriveを使う場合

Neon側では、Hyperdrive用の専用ロールを作り、**非プール接続の接続文字列**を使用します。Neonのプール済み接続文字列をさらにHyperdriveへ渡すのではなく、Hyperdriveに接続プールを任せる構成です。[^1_5][^1_4]

概略は次の形です。

```bash
npx wrangler hyperdrive create my-neon-db \
  --connection-string="postgres://USER:PASSWORD@HOST:5432/DATABASE"
```

`wrangler.jsonc`の例です。

```jsonc
{
  "compatibility_date": "2026-10-01",
  "compatibility_flags": ["nodejs_compat"],

  "hyperdrive": [
    {
      "binding": "HYPERDRIVE",
      "id": "YOUR_HYPERDRIVE_ID"
    }
  ]
}
```

接続には、Cloudflareのドキュメントで指定されているバージョン以上の`pg`を使います。

```bash
npm install pg@">=8.16.3"
npm install -D @types/pg
```

Workers上では、リクエストごとにクライアントを生成し、Hyperdriveに接続させる形が基本です。Hyperdriveが背後のプールを管理します。[^1_4]

```ts
import { Client } from "pg";

export async function queryUsers(env: Env) {
  const client = new Client({
    connectionString: env.HYPERDRIVE.connectionString,
  });

  await client.connect();

  try {
    const result = await client.query(
      "select id, name from users order by id desc limit 20"
    );
    return result.rows;
  } finally {
    await client.end();
  }
}
```

実際のNext.jsアプリでは、`env.HYPERDRIVE`の取得方法がvinextやOpenNextの構成によって異なるため、Cloudflare bindingを`cloudflare:workers`経由で取得する方式を確認してください。

## 4. `DATABASE_URL`の扱いに注意する

Neonの接続文字列を次の場所に置かないでください。

- `NEXT_PUBLIC_DATABASE_URL`
- クライアントコンポーネント。
- ブラウザへ返すJSON。
- Gitリポジトリ。
- ビルド時にクライアントバンドルへ含まれるコード。

DB接続情報はWorkersのSecretまたはHyperdrive bindingに登録します。

```bash
npx wrangler secret put DATABASE_URL
```

ただし、Hyperdriveを使うなら、通常は`DATABASE_URL`をアプリから直接読むより、Hyperdrive bindingを使う構成のほうが安全です。開発環境では`.env.local`、本番ではCloudflareのSecretやBindingというように環境を分けてください。

## 5. NeonのリージョンとCloudflareの特性

SSRリクエストは世界中のCloudflareエッジで実行される可能性があります。一方、Neonのデータベースは特定リージョンにあります。

そのため、次のような構成では思ったほど高速にならない場合があります。

```text
日本のユーザー
  ↓
東京のCloudflare Worker
  ↓
米国リージョンのNeon
```

ユーザーが主に日本にいるなら、Neonのリージョンは可能な限り日本または近隣リージョンを検討してください。ただし、Cloudflare Workersが常にユーザーに最も近い場所で実行されるとは限らず、DBへのアクセス距離がボトルネックになることがあります。

また、読み取り中心なら次の対策が有効です。

- Next.jsの`fetch`キャッシュを適切に使う。
- `revalidate`を設定する。
- Cloudflare CacheをDBの代わりに使う。
- 頻繁に変わらないデータをKVなどへ複製する。
- 1ページのSSR中に同じDBクエリを何度も実行しない。
- 必要ならリージョンを固定できる構成を検討する。

ユーザーごとの情報、認証情報、管理画面のレスポンスは、公開キャッシュしないでください。

## 6. Next.jsのキャッシュ設定を慎重にする

SSRだからといって、すべてのページを毎回DBから取得する必要はありません。

### 公開データ

```ts
const res = await fetch("https://example.com/api/news", {
  next: { revalidate: 60 },
});
```

または、Next.jsの構成に応じてISRや`revalidate`を使います。CloudflareのvinextではISRもstale-while-revalidate方式でサポートされています。[^1_1]

### ユーザー固有データ

ユーザーのCookie、Authorizationヘッダー、セッションIDに依存するページでは、意図しない共有キャッシュを防ぎます。

```ts
export const dynamic = "force-dynamic";
```

さらに、Cloudflare側で次のようなページをキャッシュしないようにします。

- `/dashboard`
- `/account`
- `/settings`
- `/api/auth/*`
- CookieやAuthorizationヘッダーを使うレスポンス。

キャッシュ設定を誤ると、別ユーザーのSSR結果が表示される重大な事故につながります。

## 7. DBクエリとSSRの設計

SSRの中でDBを直接呼ぶ場合、次の点を確認してください。

- 1リクエストあたりのクエリ数を減らす。
- N+1クエリを避ける。
- 必要な列だけ取得する。
- ページネーションを使う。
- インデックスを追加する。
- `SELECT *`を常用しない。
- トランザクションが必要な処理を明示する。
- DBエラーをそのまま画面に出さない。
- SQLログにパスワードやトークンを出さない。

例えば、認証済みページで次のように毎回複数クエリを実行すると、エッジからDBまでの距離によって遅くなります。

```text
SSRリクエスト
 ├─ ユーザー取得
 ├─ 権限取得
 ├─ プロフィール取得
 ├─ 通知取得
 └─ 設定取得
```

可能ならJOIN、集約クエリ、適切なキャッシュ、または並列化を使います。

```ts
const [profile, notifications] = await Promise.all([
  getProfile(userId),
  getNotifications(userId),
]);
```

ただし、DB接続や同時実行数を増やしすぎないよう、負荷試験は必要です。

## 8. ORMの互換性を確認する

Drizzle、Prisma、Kyselyなどを使う場合は、Cloudflare Workers対応状況を確認してください。

特に注意が必要なのは、ORMが内部で次のような機能を使うケースです。

- TCPソケット。
- Node.jsの`net`や`tls`。
- ファイルシステム。
- 起動時のネイティブバイナリ生成。
- 長期間保持するDB接続。
- Edge専用ドライバとNode.js専用ドライバの混在。

Hyperdriveを使うなら、`pg`またはPostgres.js対応のORMを選びやすくなります。Neon serverless driverを使うなら、ORM側も`@neondatabase/serverless`に対応した設定が必要です。

## 9. 認証・Cookie・ドメイン

Cloudflare経由では、開発環境と本番環境でドメインが変わるため、Cookie設定を確認してください。

本番では少なくとも次を確認します。

```ts
{
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/"
}
```

外部認証を使う場合は、次も更新が必要です。

- OAuthのRedirect URL。
- Allowed origins。
- Cookieのドメイン。
- CORS許可オリジン。
- `www`あり・なしの統一。
- Preview URLを本番OAuthに許可するかどうか。

CloudflareのAccessやWAFを有効にする場合、Next.jsのServer Actions、API、Webhook、認証コールバックがブロックされないか確認してください。

## 10. デプロイ前チェックリスト

最低限、次を確認すると安全です。

- `output: "export"`を設定していない。
- Workers向けのvinextまたはOpenNext構成になっている。
- `npx vinext check`の結果を確認した。
- SSRページがWorkers上で正常に生成される。
- `pg`などのDBドライバがWorkers互換である。
- NeonはHyperdriveまたはserverless driverで接続している。
- DB接続文字列をクライアントへ公開していない。
- Preview環境とProduction環境のDBを分離している。
- Migrationを本番DBへ誤って実行しない。
- 認証Cookieが本番ドメインで動作する。
- 動的ページをCloudflare Cacheへ誤って保存していない。
- 大きなNode.js依存関係でWorkerサイズ制限を超えていない。
- 実際のWorkersランタイムで負荷試験した。
- Neonのコールドスタート、接続数、クエリ時間を確認した。
- DB障害時にSSRが適切なエラー画面を返す。


### 結論

この構成なら、まずは次の方針がおすすめです。

```text
Next.js App Router
  + vinext
  + Cloudflare Workers
  + Hyperdrive
  + Neon PostgreSQL
  + pg / Postgres.js
```

既存アプリがOpenNext前提なら、無理にすぐ移行せず、OpenNextで動作確認してからvinextの互換性チェックを行うのが現実的です。Neon接続については、単純な読み取りAPIだけなら`@neondatabase/serverless`でも構いませんが、SSR・ORM・トランザクション・本番運用を考えるならHyperdriveを第一候補にするのが安全です。

<span style="display:none">[^1_10][^1_11][^1_12][^1_13][^1_14][^1_15][^1_16][^1_17][^1_18][^1_19][^1_20][^1_21][^1_22][^1_23][^1_24][^1_25][^1_26][^1_27][^1_28][^1_29][^1_30][^1_6][^1_7][^1_8][^1_9]</span>

<div align="center">⁂</div>

[^1_1]: https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/

[^1_2]: https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/

[^1_3]: https://opennext.js.org/cloudflare

[^1_4]: https://developers.cloudflare.com/workers/databases/third-party-integrations/neon/

[^1_5]: https://neon.com/docs/guides/cloudflare-workers

[^1_6]: https://developers.cloudflare.com/workers/databases/connecting-to-databases/

[^1_7]: https://developers.cloudflare.com/workers/databases/third-party-integrations/neon/index.md

[^1_8]: https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/

[^1_9]: https://neon.com/docs/connect/choose-connection

[^1_10]: https://neon.com/docs/serverless/serverless-driver

[^1_11]: https://neon.com/docs/guides/cloudflare-hyperdrive

[^1_12]: https://cloudflare.tv/event/using-neon-with-cloudflare-workers/zv909lgQ

[^1_13]: https://neon.com/faqs/best-backend-cloudflare-workers-edge

[^1_14]: https://webflow.com/blog/neon-postgres-webflow-cloud

[^1_15]: https://neon.com/blog/api-cf-drizzle-neon

[^1_16]: https://neon.com/faqs/postgres-serverless-functions-connection-issues

[^1_17]: https://webflow.com/blog/serverless-app-neon-webflow-cloud

[^1_18]: https://blog.cloudflare.com/neon-postgres-database-from-workers/

[^1_19]: https://developers.cloudflare.com/workers/static-assets/routing/full-stack-application/

[^1_20]: https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/index.md

[^1_21]: https://developers.cloudflare.com/pages/framework-guides/nextjs/

[^1_22]: https://developers.cloudflare.com/changelog/post/2026-05-06-react-nextjs-vulnerabilities/

[^1_23]: https://developers.cloudflare.com/workers/versions-and-deployments/

[^1_24]: https://developers.cloudflare.com/workers/ci-cd/builds/configuration/

[^1_25]: https://developers.cloudflare.com/workers/framework-guides/

[^1_26]: https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/

[^1_27]: https://developers.cloudflare.com/workers/static-assets/get-started/

[^1_28]: https://opennext.js.org/cloudflare/howtos/dev-deploy

[^1_29]: https://opennext.js.org/cloudflare/former-releases/0.2

[^1_30]: https://opennext.js.org/cloudflare/former-releases/0.3/get-started

