import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// CommonJS on purpose -- the guard is shared with two plain-`node` scripts.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { assertSeedAllowed } = require("../../scripts/seedGuard.js");

/**
 * The hole this closes: on 22 September 2026 four accounts on the live database
 * were usable with passwords printed in this repository, two of them holding
 * the owner role. They were written there by seed scripts that had nothing
 * stopping them from being pointed at a real environment.
 *
 * So the guard has to fail closed. "No opinion" must mean "no".
 */
describe("assertSeedAllowed", () => {
  it("allows a development machine", () => {
    expect(() => assertSeedAllowed("seed.ts", { NODE_ENV: "development" })).not.toThrow();
  });

  it("allows an explicit ALLOW_SEED=1 whatever NODE_ENV says", () => {
    expect(() => assertSeedAllowed("seed.ts", { NODE_ENV: "production", ALLOW_SEED: "1" })).not.toThrow();
    expect(() => assertSeedAllowed("seed.ts", { NODE_ENV: "test", ALLOW_SEED: "1" })).not.toThrow();
    expect(() => assertSeedAllowed("seed.ts", { ALLOW_SEED: "1" })).not.toThrow();
  });

  it("refuses in production", () => {
    expect(() => assertSeedAllowed("seed.ts", { NODE_ENV: "production" })).toThrow(/refuses to run/);
  });

  it("refuses when NODE_ENV is unset, rather than assuming development", () => {
    expect(() => assertSeedAllowed("seed.ts", {})).toThrow(/NODE_ENV unset/);
  });

  it("refuses under NODE_ENV=test unless the caller opts in", () => {
    // CI runs with NODE_ENV=test; `npm run e2e:reset:local` is the one caller
    // that may seed there, and it says so by setting ALLOW_SEED=1 itself.
    expect(() => assertSeedAllowed("prisma/e2eReset.ts", { NODE_ENV: "test" })).toThrow(/refuses to run/);
  });

  it("refuses anything that is not exactly 1, so a stray truthy value cannot open it", () => {
    for (const value of ["0", "true", "yes", "", " ", "2"]) {
      expect(() => assertSeedAllowed("seed.ts", { NODE_ENV: "production", ALLOW_SEED: value })).toThrow(
        /refuses to run/
      );
    }
  });

  it("names the script and points at the runbook, so the refusal is actionable", () => {
    expect(() => assertSeedAllowed("seedBreeder.js", { NODE_ENV: "production" })).toThrow(/seedBreeder\.js/);
    expect(() => assertSeedAllowed("seedBreeder.js", { NODE_ENV: "production" })).toThrow(
      /docs\/runbooks\/staff-accounts\.md/
    );
  });

  it("is case- and whitespace-insensitive about NODE_ENV=development", () => {
    expect(() => assertSeedAllowed("seed.ts", { NODE_ENV: " Development " })).not.toThrow();
  });

  it("falls back to process.env when no environment is passed", () => {
    const previous = process.env.ALLOW_SEED;
    try {
      process.env.ALLOW_SEED = "1";
      expect(() => assertSeedAllowed("seed.ts")).not.toThrow();
    } finally {
      if (previous === undefined) delete process.env.ALLOW_SEED;
      else process.env.ALLOW_SEED = previous;
    }
  });
});

/**
 * Static check, because a guard is only worth anything while it is still called.
 *
 * `prisma/seed.ts` in particular cannot be proven by running it: it has imported
 * a file that does not exist since the repository was consolidated (commit
 * b49b954 deleted the root `src/`), so it fails at import time long before its
 * own main() runs. That makes it exactly the kind of script someone repairs one
 * day and then runs, which is when the guard has to already be there.
 */
describe("every script that writes a published password is guarded", () => {
  const backendRoot = path.resolve(__dirname, "../..");
  const SEED_SCRIPTS = [
    "prisma/seed.ts",
    "prisma/e2eReset.ts",
    "seedAdminUser.ts",
    "seedBreeder.js",
    "fixPasswords.js",
  ];

  it.each(SEED_SCRIPTS)("%s requires the guard and calls it", (relativePath) => {
    const source = fs.readFileSync(path.join(backendRoot, relativePath), "utf8");
    expect(source).toContain("seedGuard.js");
    expect(source).toMatch(/assertSeedAllowed\(/);
  });

  it("the npm script that may legitimately seed says so out loud", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(backendRoot, "package.json"), "utf8"));
    // CI runs with NODE_ENV=test, so without this the e2e reset would be refused.
    expect(pkg.scripts["e2e:reset:local"]).toContain("ALLOW_SEED=1");
    // The unconfirmed variant must not carry the opt-in.
    expect(pkg.scripts["e2e:reset"]).not.toContain("ALLOW_SEED");
  });
});
