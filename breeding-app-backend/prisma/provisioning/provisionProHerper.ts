import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

/**
 * Restores ProHerper Lab's identity onto its laboratory record.
 *
 * Why this exists
 * ---------------
 * ProHerper's details — name, contact, address, phone, email, bank account and
 * logo — used to be hardcoded constants compiled into the apps, and were printed
 * on every document the platform produced, whichever laboratory ran the test.
 * Making laboratories into tenants meant removing those constants; without this
 * script ProHerper would come out of the migration with a blank address, no
 * logo and no payment details, and their certificates would be worse than
 * before.
 *
 * The values below are exactly what the old constants held. They are not a
 * default for anyone else — this script names one laboratory deliberately, and
 * every other laboratory fills its own details in through Laboratory Settings.
 *
 * Safe to run more than once: it only ever fills in fields, and refuses to
 * overwrite anything the laboratory has since changed for itself.
 *
 * Usage:
 *   cd breeding-app-backend
 *   npx tsx prisma/provisioning/provisionProHerper.ts            # dry run
 *   npx tsx prisma/provisioning/provisionProHerper.ts --apply    # write
 *
 * Add --replace-seeded when the laboratory still carries the migration's
 * placeholder name and contact, which are not a vendor's own choice.
 */

const prisma = new PrismaClient();

/** Verbatim from the constants this replaced (LAB_PROFILE, PROHERPER_CERTIFICATE_ISSUER). */
const PROHERPER = {
  labName: "ProHerper Lab",
  contactPerson: "Jurgen Wuyts",
  contactEmail: "Info@proherper.com",
  phone: "+32 95 32 07 98",
  addressLine1: "Wijngaardstraat 27",
  city: "Diest",
  // The directory shows `location` ahead of city+country, so leaving the seed's
  // value here put "Germany" under a Diest address on the breeder's lab picker.
  location: "Diest, Belgium",
  postalCode: "3290",
  country: "Belgium",
  iban: "BE62 0636 4963 1061",
  bic: "GKCCBEBB",
  turnaroundDays: 14,
  publicDescription:
    "Genetic testing for ball pythons from shed skin. Morph confirmation and sex determination.",
};

const readLogoDataUri = (): string | null => {
  try {
    const file = resolve(__dirname, "proherper-logo.png");
    return `data:image/png;base64,${readFileSync(file).toString("base64")}`;
  } catch {
    console.warn("! proherper-logo.png not found next to this script; skipping the logo.");
    return null;
  }
};

/**
 * Finds ProHerper's laboratory record.
 *
 * Matched by owner email rather than by name, because the laboratory name is
 * vendor-editable and may already have been changed, while the account the
 * platform provisioned is stable.
 */
const findLab = async () => {
  const byEmail = await prisma.labAccount.findFirst({
    where: { user: { email: { contains: "proherper", mode: "insensitive" } } },
    include: { user: true, organization: true },
  });
  if (byEmail) return byEmail;

  return prisma.labAccount.findFirst({
    where: { labName: { contains: "proherper", mode: "insensitive" } },
    include: { user: true, organization: true },
  });
};

const main = async () => {
  const apply = process.argv.includes("--apply");
  const replaceSeeded = process.argv.includes("--replace-seeded");

  const lab = await findLab();
  if (!lab) {
    console.error(
      "No ProHerper laboratory found.\n" +
        "Either the tenancy migration has not run yet, or the account uses a different\n" +
        "email. List candidates with:\n" +
        '  SELECT la."id", la."labName", u."email" FROM "LabAccount" la JOIN "User" u ON u."id" = la."userId";'
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Found: ${lab.labName}  (org ${lab.organizationId}, owner ${lab.user?.email})`);

  const logoDataUri = readLogoDataUri();
  const desired: Record<string, unknown> = { ...PROHERPER };
  if (logoDataUri) desired.logoUrl = logoDataUri;

  // Only fill blanks. If the laboratory has already set a field for itself,
  // theirs wins — this script must never overwrite a vendor's own decision.
  //
  // The exception, behind --replace-seeded: a value the *seed* wrote. The
  // tenancy migration had to give the first laboratory some name, so it carries
  // "Seed Genetics Lab" and "Seed Lab User" — placeholders nobody chose, which
  // read as "already set" and would otherwise keep ProHerper's real identity out
  // for good. Matching on the exact placeholder rather than replacing whatever
  // is there keeps the property that makes this script safe to re-run: a
  // laboratory that has named itself is still untouchable, flag or no flag.
  const SEED_PLACEHOLDERS: Record<string, string[]> = {
    labName: ["Seed Genetics Lab", "Second Genetics Lab"],
    contactPerson: ["Seed Lab User", "Second Lab User"],
    // Safe only because this script names one laboratory and finds it by its own
    // email: "Germany" is a real answer for some laboratory somewhere, but not
    // for this one, which is in Diest.
    location: ["Germany"],
  };
  const isSeedPlaceholder = (key: string, current: unknown): boolean =>
    (SEED_PLACEHOLDERS[key] || []).some(
      (placeholder) => String(current).trim().toLowerCase() === placeholder.toLowerCase()
    );

  const changes: Record<string, unknown> = {};
  const replaced: string[] = [];
  const skipped: string[] = [];
  for (const [key, value] of Object.entries(desired)) {
    const current = (lab as Record<string, unknown>)[key];
    if (current === null || current === undefined || current === "") {
      changes[key] = value;
    } else if (current === value) {
      // Already correct.
    } else if (replaceSeeded && isSeedPlaceholder(key, current)) {
      changes[key] = value;
      replaced.push(`${key} (was "${String(current)}")`);
    } else {
      skipped.push(isSeedPlaceholder(key, current) ? `${key} — seeded, pass --replace-seeded` : key);
    }
  }

  if (!Object.keys(changes).length) {
    console.log("Nothing to fill in — every field already has a value.");
    if (skipped.length) console.log(`(Left alone, already set: ${skipped.join(", ")})`);
    return;
  }

  console.log("\nWould set:");
  for (const [key, value] of Object.entries(changes)) {
    const shown = key === "logoUrl" ? `<${String(value).length} byte data URI>` : String(value);
    console.log(`  ${key.padEnd(18)} ${shown}`);
  }
  if (skipped.length) {
    console.log(`\nLeft alone, already set by the laboratory: ${skipped.join(", ")}`);
  }

  if (!apply) {
    console.log("\nDry run. Re-run with --apply to write these values.");
    return;
  }

  await prisma.labAccount.update({ where: { id: lab.id }, data: changes });
  console.log("\nApplied. ProHerper's certificates and labels now carry their own details again.");
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
