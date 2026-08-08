/**
 * Measures what the cloud-sync snapshot is actually made of.
 *
 * The snapshot endpoints ship every animal, pairing and clutch payload an account owns, so when
 * sync gets slow the useful question is never "how many records" but "which JSON keys are heavy".
 * Run this before trimming anything -- protocol work does not help if one key is 80% of the bytes.
 *
 *   railway run --service "Breeding-planner backend " --environment staging \
 *     npx tsx scripts/measureSyncPayload.ts
 *
 * Reads only; safe against production.
 */
import { prisma } from "../src/lib/prisma";

type SizeRow = { owner_id: string; rows: bigint; total_bytes: bigint; biggest_bytes: bigint };
type KeyRow = { key: string; total_bytes: bigint; rows: bigint };

const TABLES = ["Animal", "Pairing", "Clutch"] as const;

const mb = (bytes: bigint | number): string => `${(Number(bytes) / 1024 / 1024).toFixed(2)} MB`;
const kb = (bytes: bigint | number): string => `${(Number(bytes) / 1024).toFixed(1)} KB`;

const perOwner = async (table: string): Promise<SizeRow[]> => prisma.$queryRawUnsafe<SizeRow[]>(`
  SELECT "ownerId" AS owner_id,
         count(*)::bigint AS rows,
         sum(pg_column_size(payload))::bigint AS total_bytes,
         max(pg_column_size(payload))::bigint AS biggest_bytes
  FROM "${table}"
  WHERE "deletedAt" IS NULL
  GROUP BY "ownerId"
  ORDER BY sum(pg_column_size(payload)) DESC
  LIMIT 5
`);

const keyBreakdown = async (table: string, ownerId: string): Promise<KeyRow[]> => prisma.$queryRawUnsafe<KeyRow[]>(`
  SELECT key,
         sum(pg_column_size(value))::bigint AS total_bytes,
         count(*)::bigint AS rows
  FROM "${table}", LATERAL jsonb_each(payload)
  WHERE "ownerId" = $1 AND "deletedAt" IS NULL
  GROUP BY key
  ORDER BY sum(pg_column_size(value)) DESC
  LIMIT 12
`, ownerId);

const main = async () => {
  const totals = new Map<string, bigint>();

  for (const table of TABLES) {
    const rows = await perOwner(table);
    console.log(`\n=== ${table}: heaviest accounts ===`);
    if (!rows.length) {
      console.log("  (no rows)");
      continue;
    }
    for (const row of rows) {
      console.log(
        `  owner ${row.owner_id.slice(0, 8)}…  ${String(row.rows).padStart(6)} rows  ` +
        `${mb(row.total_bytes).padStart(9)} total  ${kb(row.biggest_bytes).padStart(9)} biggest row`
      );
      totals.set(row.owner_id, (totals.get(row.owner_id) || 0n) + row.total_bytes);
    }
  }

  const heaviest = [...totals.entries()].sort((a, b) => Number(b[1] - a[1]))[0];
  if (!heaviest) {
    console.log("\nNothing stored yet.");
    return;
  }

  const [ownerId, totalBytes] = heaviest;
  console.log(`\n=== Heaviest account overall: ${ownerId.slice(0, 8)}… — ${mb(totalBytes)} across all tables ===`);
  console.log("This is roughly what one snapshot response weighs uncompressed.\n");

  for (const table of TABLES) {
    const keys = await keyBreakdown(table, ownerId);
    if (!keys.length) continue;
    const tableTotal = keys.reduce((sum, key) => sum + Number(key.total_bytes), 0);
    console.log(`--- ${table} payload keys (top 12) ---`);
    for (const key of keys) {
      const share = tableTotal ? ((Number(key.total_bytes) / tableTotal) * 100).toFixed(1) : "0.0";
      console.log(`  ${key.key.padEnd(28)} ${mb(key.total_bytes).padStart(9)}  ${share.padStart(5)}%`);
    }
    console.log("");
  }
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
