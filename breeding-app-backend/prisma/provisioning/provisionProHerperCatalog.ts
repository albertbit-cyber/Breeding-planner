import { PrismaClient } from "@prisma/client";
import {
  PANEL_MEMBERSHIP_RULES,
  PROHERPER_OFFERINGS,
  PROHERPER_SERVED_SPECIES,
  PROHERPER_TIER_PRICING,
  type ProHerperOffering,
} from "./proherperCatalog";

/**
 * Loads ProHerper Labs' published catalogue onto their laboratory: 60 morph
 * tests across four species, three sex determination tests, and five panels,
 * with their real prices.
 *
 * This replaces what the tenancy migration seeded, which was the platform's own
 * ball-python list at the platform's own prices — a reasonable default for a
 * laboratory nobody had asked, but not ProHerper's actual product line.
 *
 * Idempotent: offerings are keyed on a stable id, so re-running updates in
 * place. Tests the laboratory has added itself are never touched, and tests it
 * has withdrawn are reported rather than silently revived.
 *
 * Usage:
 *   cd breeding-app-backend
 *   npx tsx prisma/provisioning/provisionProHerperCatalog.ts            # dry run
 *   npx tsx prisma/provisioning/provisionProHerperCatalog.ts --apply
 */

const prisma = new PrismaClient();

const findLab = async () => {
  const byEmail = await prisma.labAccount.findFirst({
    where: { user: { email: { contains: "proherper", mode: "insensitive" } } },
    include: { user: true },
  });
  if (byEmail) return byEmail;
  return prisma.labAccount.findFirst({
    where: { labName: { contains: "proherper", mode: "insensitive" } },
    include: { user: true },
  });
};

const offeringId = (organizationId: string, key: string) => `off_${organizationId}_${key}`;

const toRow = (organizationId: string, offering: ProHerperOffering) => ({
  organizationId,
  name: offering.name,
  shortLabel: null,
  category: offering.category,
  pricingType: offering.pricingType as "morph" | "sex",
  testKind: offering.testKind,
  priceModel: offering.priceModel ?? "tier",
  priceCents: offering.priceCents ?? null,
  tierPricesJson: offering.tierPricesCents ?? undefined,
  addonPriceCents: offering.addonPriceCents ?? null,
  currency: "EUR",
  speciesIds: offering.speciesIds,
  aliases: offering.aliases ?? [],
  availability: offering.availability ?? "available",
  panelScope: offering.panelScope ?? null,
  description: offering.description ?? null,
  // A coming-soon test is published so breeders can see it is on the way, but
  // the pricing engine refuses to quote it.
  active: true,
  visibleInBreederApp: true,
  sortOrder: offering.sortOrder,
});

const main = async () => {
  const apply = process.argv.includes("--apply");

  const lab = await findLab();
  if (!lab) {
    console.error("No ProHerper laboratory found. Run the tenancy migration first.");
    process.exitCode = 1;
    return;
  }
  const organizationId = lab.organizationId;
  console.log(`Laboratory: ${lab.labName}  (org ${organizationId})\n`);

  // The laboratory's served species must exist before any test can claim one.
  if (apply) {
    await prisma.labAccount.update({
      where: { organizationId },
      data: { servedSpeciesIds: PROHERPER_SERVED_SPECIES },
    });
  }

  const existing = await prisma.labTestOffering.findMany({ where: { organizationId } });
  const existingById = new Map(existing.map((row) => [row.id, row]));
  const normalizeName = (value: string) => value.trim().toLowerCase();
  const existingByName = new Map(existing.map((row) => [normalizeName(row.name), row]));

  // A laboratory cannot list the same name twice, so a seeded "Clown" and this
  // catalogue's "Clown" are the same product under two ids. Creating the second
  // one violates that constraint outright -- which is exactly what happened the
  // first time this ran against a laboratory the migration had already seeded.
  //
  // The seeded row is adopted instead: updated in place, keeping its id, so the
  // order lines already pointing at it keep resolving. Matching on the id first
  // means a laboratory that has run this before still updates cleanly.
  const targetIdFor = (offering: ProHerperOffering): string => {
    const stableId = offeringId(organizationId, offering.key);
    if (existingById.has(stableId)) return stableId;
    const sameName = existingByName.get(normalizeName(offering.name));
    return sameName ? sameName.id : stableId;
  };

  const adopted = PROHERPER_OFFERINGS.filter((o) => {
    const stableId = offeringId(organizationId, o.key);
    return !existingById.has(stableId) && existingByName.has(normalizeName(o.name));
  });
  const claimedIds = new Set(PROHERPER_OFFERINGS.map(targetIdFor));

  // Anything already on the laboratory's list that this catalogue does not
  // mention: either something they added themselves, or a leftover from the
  // platform's generic seed. Reported, never deleted — an offering an order
  // points at must keep resolving.
  const notInCatalogue = existing.filter((row) => !claimedIds.has(row.id));

  const created = PROHERPER_OFFERINGS.filter((o) => !existingById.has(targetIdFor(o)));
  const updated = PROHERPER_OFFERINGS.filter((o) => existingById.has(targetIdFor(o)));

  const byKind = (kind: string) => PROHERPER_OFFERINGS.filter((o) => o.testKind === kind).length;
  console.log(`Serves ${PROHERPER_SERVED_SPECIES.length} species: ${PROHERPER_SERVED_SPECIES.join(", ")}`);
  console.log(
    `Catalogue: ${PROHERPER_OFFERINGS.length} offerings ` +
      `(${byKind("morph")} morph, ${byKind("sex")} sex, ${byKind("panel")} panels)`
  );
  console.log(`  to create: ${created.length}`);
  console.log(`  to update: ${updated.length}`);
  if (adopted.length) {
    console.log(
      `  of those updates, ${adopted.length} adopt a seeded offering of the same name ` +
        `(kept by id so existing order lines still resolve):`
    );
    for (const row of adopted.slice(0, 10)) console.log(`    - ${row.name}`);
    if (adopted.length > 10) console.log(`    … and ${adopted.length - 10} more`);
  }
  if (notInCatalogue.length) {
    console.log(`\n  ${notInCatalogue.length} existing offering(s) are not in this catalogue:`);
    for (const row of notInCatalogue.slice(0, 10)) console.log(`    - ${row.name}`);
    if (notInCatalogue.length > 10) console.log(`    … and ${notInCatalogue.length - 10} more`);
    console.log("    Left alone. Retire them in the Lab Portal if they are stale.");
  }

  const unresolvedPanels = Object.entries(PANEL_MEMBERSHIP_RULES)
    .filter(([, rule]) => rule === "unresolved")
    .map(([key]) => key);
  console.log(
    `\n  ${unresolvedPanels.length} panel(s) have unpublished membership and ship unresolved:`
  );
  for (const key of unresolvedPanels) console.log(`    - ${key}`);
  console.log("    They price correctly; they just cannot yet say which tests they include.");

  if (!apply) {
    console.log("\nDry run. Re-run with --apply to write.");
    return;
  }

  for (const offering of PROHERPER_OFFERINGS) {
    const id = targetIdFor(offering);
    const data = toRow(organizationId, offering);
    await prisma.labTestOffering.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });
  }

  // Panels that resolve by rule are filled in now that every offering exists.
  const allBallPythonMorphs = await prisma.labTestOffering.findMany({
    where: {
      organizationId,
      testKind: "morph",
      speciesIds: { has: "ball-python" },
      availability: "available",
      active: true,
    },
    select: { id: true },
  });
  const memberIds = allBallPythonMorphs.map((row) => row.id);

  for (const [key, rule] of Object.entries(PANEL_MEMBERSHIP_RULES)) {
    if (rule !== "all_available_bp_morphs") continue;
    await prisma.labTestOffering.update({
      where: { id: offeringId(organizationId, key) },
      data: { panelMemberIds: memberIds },
    });
  }

  await prisma.pricingConfig.upsert({
    where: { organizationId },
    update: PROHERPER_TIER_PRICING,
    create: {
      id: `pricing_${organizationId}`,
      organizationId,
      isActive: true,
      ...PROHERPER_TIER_PRICING,
    },
  });

  console.log(`\nApplied. ${PROHERPER_OFFERINGS.length} offerings written.`);
  console.log(`Panels resolved by rule now list ${memberIds.length} member tests each.`);
  console.log("Tier pricing set to 35/30/25 morph, 20 additional, 30/25/20 sex.");
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
