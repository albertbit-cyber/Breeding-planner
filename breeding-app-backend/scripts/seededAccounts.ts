/**
 * Every address a seed script in this repository creates or resets, with the
 * published password each one sets and where it is written down.
 *
 * This is the single list that `npm run audit:staff` flags against and that
 * `npm run retire:seeded` is willing to act on. Keep it in step with
 * prisma/seed.ts, prisma/e2eReset.ts, seedAdminUser.ts, seedBreeder.js and
 * fixPasswords.js -- an address that drops off this list stops being flagged,
 * and an address that is not on it cannot be retired by the script (on purpose:
 * a real person's account is handled from the admin console, where the action
 * is attributed to whoever took it).
 */
export const SEEDED_ACCOUNTS: Record<string, { password: string; sources: string }> = {
  "admin@breedingplanner.dev": {
    password: "admin1234",
    sources: "prisma/seed.ts, seedAdminUser.ts, prisma/e2eReset.ts",
  },
  "admin@proherper.dev": {
    password: "demo1234",
    sources: "seedBreeder.js, fixPasswords.js",
  },
  "lab@proherper.dev": {
    password: "demo1234",
    sources: "prisma/seed.ts, prisma/e2eReset.ts, seedBreeder.js, fixPasswords.js",
  },
  "lab-b@proherper.dev": {
    password: "demo1234",
    sources: "prisma/e2eReset.ts",
  },
  "breeder@proherper.dev": {
    password: "breeder1234 / demo1234",
    sources: "prisma/seed.ts, prisma/e2eReset.ts, seedBreeder.js, fixPasswords.js",
  },
  "buyer@breedingplanner.dev": {
    password: "buyer1234",
    sources: "prisma/seed.ts",
  },
};

export const normaliseEmail = (email: unknown): string => String(email || "").trim().toLowerCase();

export const isSeededAddress = (email: unknown): boolean =>
  Object.prototype.hasOwnProperty.call(SEEDED_ACCOUNTS, normaliseEmail(email));
