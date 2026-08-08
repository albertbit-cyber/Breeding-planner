/**
 * Dumps every animal payload to a local JSON file so a data migration can be undone.
 *
 *   railway run --service "Breeding-planner backend " --environment staging \
 *     npx tsx scripts/backupAnimalPayloads.ts <output-path>
 *
 * Restore is a straight replay: read the file back and write each payload to its row id.
 */
import { writeFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";

const main = async () => {
  const target = process.argv[2];
  if (!target) throw new Error("Usage: backupAnimalPayloads.ts <output-path>");

  const animals = await (prisma as any).animal.findMany({
    select: { id: true, ownerId: true, appAnimalId: true, payload: true, updatedAt: true },
  });

  writeFileSync(target, JSON.stringify({
    takenAt: new Date().toISOString(),
    count: animals.length,
    animals,
  }, null, 0), "utf8");

  console.log(`wrote ${animals.length} animal payloads to ${target}`);
};

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
