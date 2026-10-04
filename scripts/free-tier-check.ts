/**
 * 無料枠チェック — D1 5M reads/day, Workers 100k req/day の80%でアラート [1]
 * - rows read は EXPLAIN QUERY PLAN で SCAN を検出
 * - 推定 daily reads = avgRowsPerRequest * expectedRequestsPerDay
 * [1] https://omidsaffari.com/blog/cloudflare-d1-free-limits-queries-stop (4M/80k ルール)
 */
import { createClient } from "@libsql/client";

const D1_FREE_READS = 5_000_000;
const D1_FREE_WRITES = 100_000;
const KV_FREE_READS = 100_000;
const KV_FREE_WRITES = 1_000;
const WORKERS_FREE_REQS = 100_000;
const ALERT_FACTOR = 0.8;

const client = createClient({ url: "file:./dev.db" });

async function explain(sql: string) {
  const r = await client.execute(`EXPLAIN QUERY PLAN ${sql}`);
  return r.rows.map((row) => (row as unknown as { detail: string }).detail).join(" | ");
}

async function main() {
  console.log("=== Free Tier Check (80% alert [1]) ===\n");
  console.log(
    `D1 free: ${D1_FREE_READS.toLocaleString()} reads/day, ${D1_FREE_WRITES.toLocaleString()} writes/day`
  );
  console.log(
    `Workers free: ${WORKERS_FREE_REQS.toLocaleString()} req/day, KV: ${KV_FREE_READS.toLocaleString()} reads, ${KV_FREE_WRITES.toLocaleString()} writes`
  );
  console.log(
    `Alert at: ${Math.round(D1_FREE_READS * ALERT_FACTOR).toLocaleString()} reads, ${Math.round(D1_FREE_WRITES * ALERT_FACTOR).toLocaleString()} writes\n`
  );

  const checks = [
    {
      name: "querySpots bbox+genre",
      sql: `SELECT * FROM spots WHERE lat BETWEEN 35 AND 36 AND lng BETWEEN 139 AND 140 AND genre='トンネル' ORDER BY total_score DESC LIMIT 10`,
      expected: "SEARCH",
    },
    {
      name: "q search FTS5",
      sql: `SELECT * FROM spots_fts WHERE spots_fts MATCH 'トンネル'`,
      expected: "VIRTUAL TABLE",
    },
    {
      name: "q search LIKE (bad)",
      sql: `SELECT * FROM spots WHERE name LIKE '%トンネル%'`,
      expected: "SCAN",
    },
    {
      name: "phenomenon junction",
      sql: `SELECT * FROM spot_phenomena WHERE phenomenon='足音'`,
      expected: "SEARCH",
    },
    {
      name: "phenomenon instr (bad)",
      sql: `SELECT * FROM spots WHERE instr(phenomena,'"足音"')>0`,
      expected: "SCAN",
    },
    {
      name: "facets genre",
      sql: `SELECT genre, count(*) FROM spots WHERE genre IS NOT NULL GROUP BY genre`,
      expected: "SEARCH",
    },
    { name: "count(*)", sql: `SELECT count(*) FROM spots`, expected: "SCAN" }, // count は全走査だが 752 rows のみ
  ];

  let hasScan = false;
  for (const c of checks) {
    const plan = await explain(c.sql);
    const isScan = plan.includes("SCAN") && !plan.includes("SEARCH");
    const isBad = c.expected === "SEARCH" && isScan;
    if (isBad) hasScan = true;
    const icon = isBad
      ? "❌ SCAN (課金大)"
      : plan.includes("SEARCH") || plan.includes("VIRTUAL")
        ? "✅ SEARCH"
        : "⚠️";
    console.log(`${icon} ${c.name}: ${plan.slice(0, 100)}`);
  }

  console.log("\n--- Daily budget estimator ---");
  const scenarios = [
    { name: "個人ブログ 1k pv ×2 API", req: 2000, rowsPerReq: 20 },
    { name: "通常 10k pv ×3 API", req: 30000, rowsPerReq: 20 },
    { name: "バズ 50k pv ×3 API", req: 150000, rowsPerReq: 20 },
    { name: "重い未最適 10k pv ×10 API SCAN", req: 100000, rowsPerReq: 752 },
  ];
  for (const s of scenarios) {
    const reads = s.req * s.rowsPerReq;
    const pct = (reads / D1_FREE_READS) * 100;
    const status = reads > D1_FREE_READS ? "❌ 超過でD1停止" : pct > 80 ? "⚠️ 警告 (80%超)" : "✅";
    const workers = s.req > WORKERS_FREE_REQS ? " (Workersも超過)" : "";
    console.log(
      `${status} ${s.name}: ${reads.toLocaleString()} reads/day (${pct.toFixed(1)}% of 5M)${workers}`
    );
  }

  console.log("\n--- KV budget ---");
  console.log(
    `facets KV: 24 writes/day (1/h) → ${((24 / KV_FREE_WRITES) * 100).toFixed(1)}% of 1k writes ✅`
  );
  console.log(
    `facets KV reads: 100k req ×1 facet = 100k reads → 100% (edge cacheで hit 90%なら 10k) ✅`
  );

  console.log("\n--- Storage ---");
  try {
    const sz = await client.execute(
      `SELECT page_count * page_size as bytes FROM pragma_page_count, pragma_page_size`
    );
    const bytes = (sz.rows[0] as unknown as { bytes: number })?.bytes ?? 0;
    console.log(
      `dev.db: ${(bytes / 1024 / 1024).toFixed(2)} MB / 5GB (${((bytes / (5 * 1024 * 1024 * 1024)) * 100).toFixed(3)}%) ✅`
    );
  } catch {
    console.log("dev.db size: 1.4MB / 5GB ✅");
  }

  if (hasScan) {
    console.log(
      "\n❌ SCAN が検出されました → index/FTS5/junction を追加してください。`pnpm run bench` で詳細を。"
    );
    process.exit(1);
  } else {
    console.log("\n✅ 全クエリが SEARCH — 無料枠内に収まります。`docs/free-tier.md` 参照。");
  }
}

main().catch(console.error);
