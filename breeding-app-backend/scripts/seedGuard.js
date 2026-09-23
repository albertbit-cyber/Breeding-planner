/**
 * One gate in front of every script that writes a known account with a password
 * that is printed in this repository.
 *
 * On 22 September 2026 an audit of the live database found four such accounts
 * usable with their published passwords, two of them holding the owner role.
 * They got there because nothing stopped a seed script from being pointed at a
 * real environment -- `seedBreeder.js` even opens with the line "Run in Railway
 * console: node seedBreeder.js".
 *
 * So the rule is fail-closed: a seed refuses to run unless it is told, in the
 * environment, that seeding is wanted here.
 *
 *   NODE_ENV=development   an ordinary developer machine, or
 *   ALLOW_SEED=1           an explicit "yes, seed this database"
 *
 * Anything else -- production, test, staging, an unset NODE_ENV, a Railway
 * shell -- refuses. `ALLOW_SEED=1` is deliberately the only way to seed a
 * non-development environment, so that doing it is always a visible, typed act
 * rather than the default. The one automated caller that legitimately needs it,
 * `npm run e2e:reset:local`, sets it in package.json where it can be read.
 *
 * CommonJS on purpose: `seedBreeder.js` and `fixPasswords.js` run under plain
 * `node`, the prisma scripts run under `tsx`, and this way all five share one
 * implementation instead of two that can drift apart.
 */

/**
 * Throws unless this environment has said it wants to be seeded.
 *
 * @param {string} scriptName - what to name in the refusal, e.g. "prisma/seed.ts".
 * @param {NodeJS.ProcessEnv} [env] - overridable for tests.
 */
function assertSeedAllowed(scriptName, env) {
  const source = env || process.env;
  const nodeEnv = String(source.NODE_ENV || "").trim().toLowerCase();
  const allowSeed = String(source.ALLOW_SEED || "").trim();

  if (nodeEnv === "development" || allowSeed === "1") {
    return;
  }

  const describedEnv = nodeEnv ? `NODE_ENV=${nodeEnv}` : "NODE_ENV unset";
  throw new Error(
    `${scriptName} refuses to run: ${describedEnv} and ALLOW_SEED is not 1.\n` +
      "\n" +
      "This script writes accounts whose passwords are published in this repository,\n" +
      "so it must never touch an environment anyone else can reach. Run it with\n" +
      "NODE_ENV=development against a local database, or set ALLOW_SEED=1 if you\n" +
      "genuinely mean to seed this one.\n" +
      "\n" +
      "To create a real staff account on a deployed environment, use POST /admin/users\n" +
      "instead -- see docs/runbooks/staff-accounts.md."
  );
}

module.exports = { assertSeedAllowed };
