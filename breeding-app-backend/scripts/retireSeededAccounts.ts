/**
 * Retires accounts whose passwords are printed in this repository.
 *
 *   npm run retire:seeded -- <email> [<email> ...]              dry run
 *   npm run retire:seeded -- <email> [...] --confirm            rotate + suspend
 *   npm run retire:seeded -- <email> [...] --confirm --delete   delete, if it owns nothing
 *
 * Against a deployed environment, run it through the Railway CLI so it reads
 * that environment's DATABASE_URL, and read `railway status` first:
 *
 *   railway status
 *   railway run npm run retire:seeded -- admin@breedingplanner.dev --confirm
 *
 * Only addresses in scripts/seededAccounts.ts are accepted. What each treatment
 * does, and why delete is refused for an account that owns anything, is in
 * scripts/lib/retireSeededAccounts.ts and docs/runbooks/staff-accounts.md.
 */
import { prisma } from "../src/lib/prisma";
import { describeOutcome, retireSeededAccounts } from "./lib/retireSeededAccounts";

const args = process.argv.slice(2);
const flags = new Set(args.filter((argument) => argument.startsWith("--")));
const emails = args.filter((argument) => !argument.startsWith("--"));

const main = async (): Promise<void> => {
  const unknownFlag = [...flags].find((flag) => !["--confirm", "--delete"].includes(flag));
  if (unknownFlag) {
    console.error(`[retire:seeded] unknown flag ${unknownFlag}. Flags: --confirm, --delete.`);
    process.exitCode = 1;
    return;
  }
  if (!emails.length) {
    console.error(
      "[retire:seeded] usage: npm run retire:seeded -- <email> [<email> ...] [--confirm] [--delete]"
    );
    process.exitCode = 1;
    return;
  }

  const confirm = flags.has("--confirm");
  const mode = flags.has("--delete") ? "delete" : "neutralise";

  console.log(
    `\n[retire:seeded] ${confirm ? "APPLYING" : "dry run"} -- mode ${mode}, ${emails.length} address(es)\n`
  );

  const outcomes = await retireSeededAccounts(prisma, { emails, mode, confirm });
  for (const outcome of outcomes) {
    console.log(`  ${describeOutcome(outcome)}\n`);
  }

  if (!confirm) {
    console.log("  Nothing was written. Re-run with --confirm to apply.\n");
  } else {
    console.log("  Done. Re-run `npm run audit:staff` to see the result.\n");
  }

  if (outcomes.some((outcome) => outcome.action === "skipped")) {
    process.exitCode = 1;
  }
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
