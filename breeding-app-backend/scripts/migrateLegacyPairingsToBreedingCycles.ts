/**
 * Legacy pairings → breeding cycles, server side. Dry run by default.
 *
 *   npm run breeding:migrate-legacy            # report only, writes nothing
 *   npm run breeding:migrate-legacy -- --apply # write the planned cycles
 *   npm run breeding:migrate-legacy -- --owner <userId>   # one account only
 *
 * Refuses to write unless LEGACY_BREEDING_MIGRATION_CONFIRM names the environment the
 * DATABASE_URL points at ("local" for this machine; anything else is the owner's deliberate
 * call, typed in full). Reading for the report needs no confirmation.
 *
 * Why the planner is imported from the breeder app: the breeder app is local-first and runs the
 * same mapping on each device, keyed on deterministic ids (bc-legacy-<pairing id>). Running the
 * identical code here means a cycle created by this script and one created by a device are the
 * same record and merge on sync instead of duplicating. The import is dynamic because that
 * module is browser-neutral ESM in another package; tsx resolves it at run time.
 *
 * What it does, per owner:
 *  1. Loads live Pairing rows (payload = the app's pairing record) and existing breeding cycles.
 *  2. Runs planLegacyMigration: one cycle per pairing unless female AND an explicit season token
 *     say two pairings share a season; dated locks become dated records with provenance;
 *     aggregate counts stay aggregates; unknown lock status stays unknown.
 *  3. Prints the reconciliation report: counts before/after, mappings, cycles needing review.
 *  4. With --apply: inserts the planned cycles (createMany, skipDuplicates). Rerun-safe: an
 *     existing cycle id or an already-mapped pairing id is skipped by the planner.
 *
 * Nothing is deleted or rewritten. Pairing rows stay as they are. Recovery: delete the cycles
 * whose payload.legacy.migratedAt equals this run's timestamp (printed), or restore from the
 * backup taken before --apply (see docs/runbooks/breeding-cycles-migration.md).
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { prisma } from "../src/lib/prisma";

const APPLY = process.argv.includes("--apply");
const ownerFlag = process.argv.indexOf("--owner");
const ONLY_OWNER = ownerFlag >= 0 ? process.argv[ownerFlag + 1] : null;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

const environmentOfDatabase = (): string => {
  const raw = String(process.env.DATABASE_URL || "").trim();
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return LOCAL_HOSTS.has(host) ? "local" : host;
  } catch {
    throw new Error("DATABASE_URL is missing or not a URL.");
  }
};

const assertConfirmed = (): void => {
  const environment = environmentOfDatabase();
  const confirm = String(process.env.LEGACY_BREEDING_MIGRATION_CONFIRM || "").trim();
  if (confirm !== environment) {
    throw new Error(`Refusing to write: set LEGACY_BREEDING_MIGRATION_CONFIRM=${environment} to confirm the target database.`);
  }
};

type Json = Record<string, unknown>;
const asRecord = (value: unknown): Json | null => (value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null);

const loadPlanner = async () => {
  const modulePath = path.resolve(__dirname, "../../breeding-app-breeder/src/features/breeding/domain/legacyMigration.js");
  const mod = await import(pathToFileURL(modulePath).href);
  return mod as {
    planLegacyMigration: (pairings: Json[], existing: Json[], options?: { now?: string }) => { cycles: Json[]; report: Json };
    legacyCounts: (pairings: Json[]) => Json;
    cycleCounts: (cycles: Json[]) => Json;
  };
};

const columnsFor = (payload: Json) => {
  const closure = asRecord(payload.closure);
  const status = typeof payload.status === "string" ? payload.status : "active";
  return {
    femaleAnimalAppId: String(payload.femaleId || ""),
    seasonLabel: typeof payload.seasonLabel === "string" ? payload.seasonLabel : null,
    startDate: typeof payload.startDate === "string" ? payload.startDate.slice(0, 10) : null,
    status,
    closureOutcome: status === "closed" && closure ? String(closure.outcome || "") || null : null,
    closedAt: status === "closed" && closure && closure.closedAt ? new Date(String(closure.closedAt)) : null,
    multipleSires: payload.multipleSires === true,
  };
};

const main = async () => {
  const db = prisma as any;
  const planner = await loadPlanner();
  const runAt = new Date().toISOString();
  const environment = environmentOfDatabase();
  console.log(`[breeding-migration] ${APPLY ? "APPLY" : "DRY RUN"} against ${environment} at ${runAt}`);
  if (APPLY) assertConfirmed();

  const owners: Array<{ ownerId: string }> = ONLY_OWNER
    ? [{ ownerId: ONLY_OWNER }]
    : (await db.pairing.findMany({ where: { deletedAt: null }, select: { ownerId: true }, distinct: ["ownerId"] }));

  let totalPlanned = 0;
  let totalWritten = 0;
  for (const { ownerId } of owners) {
    const [pairingRows, cycleRows] = await Promise.all([
      db.pairing.findMany({ where: { ownerId, deletedAt: null } }),
      db.breedingCycle.findMany({ where: { ownerId } }),
    ]);
    const pairings = pairingRows.map((row: any) => ({ ...(asRecord(row.payload) || {}), id: row.appPairingId }));
    const existing = cycleRows.map((row: any) => ({ ...(asRecord(row.payload) || {}), id: row.appCycleId }));
    const { cycles, report } = planner.planLegacyMigration(pairings, existing, { now: runAt });
    const before = planner.legacyCounts(pairings);
    const after = planner.cycleCounts(cycles);
    totalPlanned += cycles.length;
    console.log(`\n[owner ${ownerId}] pairings=${pairingRows.length} existingCycles=${cycleRows.length} planned=${cycles.length}`);
    console.log(`  legacy counts: ${JSON.stringify(before)}`);
    console.log(`  planned counts: ${JSON.stringify(after)}`);
    console.log(`  report: converted=${report.converted} merged=${report.merged} skippedExisting=${report.skippedExisting} skippedInvalid=${report.skippedInvalid}`);
    const review = Array.isArray(report.reviewNeeded) ? report.reviewNeeded : [];
    if (review.length) {
      console.log(`  needs review (${review.length}):`);
      review.forEach((item: any) => console.log(`    ${item.cycleId} <- ${item.pairingIds.join(", ")}: ${item.reasons.join(", ")}`));
    }
    const aggregates = Array.isArray(report.aggregateLocks) ? report.aggregateLocks : [];
    if (aggregates.length) console.log(`  aggregate lock counts kept as aggregates: ${aggregates.map((a: any) => `${a.cycleId} (${a.count})`).join(", ")}`);

    if (APPLY && cycles.length) {
      const rows = cycles.map((payload) => ({ ownerId, appCycleId: String(payload.id), ...columnsFor(payload), payload }));
      const result = await db.breedingCycle.createMany({ data: rows, skipDuplicates: true });
      totalWritten += Number(result?.count || 0);
      console.log(`  wrote ${result?.count || 0} cycles (payload.legacy.migratedAt = ${runAt})`);
    }
  }
  console.log(`\n[breeding-migration] owners=${owners.length} planned=${totalPlanned} written=${totalWritten}${APPLY ? "" : " (dry run, nothing written)"}`);
};

main()
  .catch((error) => {
    console.error("[breeding-migration] failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
