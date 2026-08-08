/**
 * Collapses duplicated animal log entries created by the random-id backfill bug.
 *
 * sanitizeSnakeRecord in the breeder app used to assign crypto.randomUUID() to any log entry that
 * had no id. It runs on every merge, and the sync service deliberately keeps id-less entries
 * (keyed by their content), so each sync minted a fresh "distinct" copy of the same reading. One
 * account reached 222,517 weight entries representing 116 real readings.
 *
 * Both sides of that loop are fixed (the client now derives a stable id from the entry's content,
 * and the merge drops an id-less entry when an identical entry with an id is present), but data
 * already written stays duplicated until this runs.
 *
 * Entries are grouped by the same content signature both sides now use; one survivor is kept per
 * group, preferring one that already carries an id so existing references stay valid.
 *
 *   # report only, changes nothing:
 *   railway run --service "Breeding-planner backend " --environment staging \
 *     npx tsx scripts/dedupeAnimalLogs.ts
 *
 *   # actually write:
 *   ... npx tsx scripts/dedupeAnimalLogs.ts --apply
 */
import { prisma } from "../src/lib/prisma";

type JsonRecord = Record<string, unknown>;

const APPLY = process.argv.includes("--apply");

const textValue = (value: unknown): string => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const explicitId = (entry: JsonRecord): string => (
  [entry.id, entry.logId, entry.uuid, entry.appId].map(textValue).find(Boolean) || ""
);

const signature = (entry: JsonRecord, label: string): string => [
  label,
  entry.date,
  entry.time,
  entry.result || entry.outcome,
  entry.feed || entry.food || entry.prey,
  entry.size || entry.weight || entry.grams,
  entry.notes || entry.note,
].map(textValue).join("|");

const dedupeLogArray = (entries: unknown[], label: string): JsonRecord[] => {
  const bySignature = new Map<string, JsonRecord>();
  for (const raw of entries) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const entry = raw as JsonRecord;
    const key = signature(entry, label);
    const kept = bySignature.get(key);
    if (!kept) {
      bySignature.set(key, entry);
      continue;
    }
    // Prefer the copy that already has an id; otherwise keep what we had.
    if (!explicitId(kept) && explicitId(entry)) bySignature.set(key, entry);
  }
  return [...bySignature.values()];
};

const main = async () => {
  console.log(APPLY ? "MODE: applying changes\n" : "MODE: dry run (pass --apply to write)\n");

  const animals: { id: string; appAnimalId: string; payload: unknown }[] = await (prisma as any).animal.findMany({
    where: { deletedAt: null },
    select: { id: true, appAnimalId: true, payload: true },
  });

  let scanned = 0;
  let changed = 0;
  let entriesBefore = 0;
  let entriesAfter = 0;

  for (const animal of animals) {
    scanned += 1;
    const payload = animal.payload as JsonRecord | null;
    if (!payload || typeof payload !== "object") continue;
    const logs = payload.logs as JsonRecord | null;
    if (!logs || typeof logs !== "object" || Array.isArray(logs)) continue;

    const nextLogs: JsonRecord = {};
    let animalChanged = false;

    for (const label of Object.keys(logs)) {
      const value = (logs as JsonRecord)[label];
      if (!Array.isArray(value)) {
        nextLogs[label] = value;
        continue;
      }
      const deduped = dedupeLogArray(value, label);
      entriesBefore += value.length;
      entriesAfter += deduped.length;
      if (deduped.length !== value.length) animalChanged = true;
      nextLogs[label] = deduped;
    }

    if (!animalChanged) continue;
    changed += 1;

    if (APPLY) {
      await (prisma as any).animal.update({
        where: { id: animal.id },
        data: { payload: { ...payload, logs: nextLogs } },
      });
    }
  }

  const removed = entriesBefore - entriesAfter;
  const pct = entriesBefore ? ((removed / entriesBefore) * 100).toFixed(1) : "0.0";
  console.log(`animals scanned:        ${scanned}`);
  console.log(`animals with dupes:     ${changed}`);
  console.log(`log entries before:     ${entriesBefore}`);
  console.log(`log entries after:      ${entriesAfter}`);
  console.log(`entries removed:        ${removed} (${pct}%)`);
  if (!APPLY && removed > 0) console.log("\nNothing was written. Re-run with --apply to make it real.");
};

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
