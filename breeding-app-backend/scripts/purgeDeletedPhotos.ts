/**
 * Hard-deletes photos that were soft-deleted more than 30 days ago, and uploads abandoned before
 * they completed (pending for over a day). See photoService.purgeDeletedPhotos.
 *
 * A soft-deleted photo that some live animal still points at (the same picture on two cards, one
 * of them deleted) is restored instead of purged.
 *
 * Not scheduled anywhere on purpose: run it by hand, or wire it to a cron once it has been watched
 * doing the right thing on staging. The storage driver comes from the same env as the server.
 *
 *   # report only, changes nothing:
 *   npx tsx scripts/purgeDeletedPhotos.ts
 *
 *   # actually delete:
 *   npx tsx scripts/purgeDeletedPhotos.ts --apply
 */
import { prisma } from "../src/lib/prisma";
import { purgeDeletedPhotos } from "../src/services/photoService";
import { describeStorageConfig } from "../src/services/uploadStorageService";

const APPLY = process.argv.includes("--apply");

const main = async () => {
  console.log(describeStorageConfig());
  const result = await purgeDeletedPhotos({ dryRun: !APPLY });
  console.log(
    `[photos:purge] ${APPLY ? "applied" : "dry run"}: purged=${result.purged} kept-still-referenced=${result.kept} abandoned-uploads=${result.abandoned}`
  );
  if (!APPLY) console.log("[photos:purge] nothing was changed. Re-run with --apply to delete.");
};

main()
  .catch((error) => {
    console.error("[photos:purge] failed", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
