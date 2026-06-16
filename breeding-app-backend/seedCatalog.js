// Run in Railway console: node seedCatalog.js
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const toCode = (name) =>
  String(name || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "CATALOG_TEST";

const MORPH_TESTS = [
  { name: "Pied", geneticType: "recessive" },
  { name: "Lavender Albino", geneticType: "recessive" },
  { name: "Ultramel", geneticType: "recessive", description: "Two lines exist; only one can be tested (the rare NoCo line cannot be tested)." },
  { name: "Hypo", geneticType: "recessive", description: "Also known as Orange Ghost." },
  { name: "Clown", geneticType: "recessive", description: "Tests Clown only; does not check Cryptic." },
  { name: "Cryptic", geneticType: "recessive", description: "Tests Cryptic only; does not check Clown." },
  { name: "Genetic stripe", geneticType: "recessive" },
  { name: "VPI Axanthic", geneticType: "recessive", description: "Cannot be used to check TSK, MJ, or other Axanthic lines." },
  { name: "Desert ghost", geneticType: "recessive" },
  { name: "Puzzle", geneticType: "recessive" },
  { name: "Sunset", geneticType: "recessive" },
  { name: "Monarch", geneticType: "recessive", description: "Two lines of Monarch exist; this test checks both." },
  { name: "Lace", geneticType: "recessive" },
  { name: "Zebra", geneticType: "recessive" },
  { name: "Rainbow", geneticType: "recessive" },
  { name: "Monsoon", geneticType: "recessive", description: "Holdback test — 99% accurate. Cannot be used for definitive results." },
  { name: "Yb", geneticType: "codominant" },
  { name: "Specter", geneticType: "codominant" },
  { name: "Spark", geneticType: "codominant" },
  { name: "Gravel", geneticType: "codominant" },
  { name: "Asphalt", geneticType: "codominant" },
  { name: "Special", geneticType: "codominant" },
  { name: "Mojave", geneticType: "codominant" },
  { name: "Lesser/Butter", geneticType: "codominant" },
  { name: "Mystic/Phantom", geneticType: "codominant" },
  { name: "Russo", geneticType: "codominant" },
  { name: "Bamboo", geneticType: "codominant" },
  { name: "Spider", geneticType: "dominant" },
  { name: "Woma", geneticType: "dominant" },
  { name: "Chocolate", geneticType: "dominant" },
  { name: "Wookie", geneticType: "dominant" },
  { name: "Spotnose", geneticType: "codominant" },
  { name: "Champagne", geneticType: "dominant" },
  { name: "Bongo", geneticType: "dominant" },
  { name: "Het Red Axanthic (HRA)", geneticType: "codominant" },
  { name: "Hidden gene woma (Hgw)", geneticType: "codominant" },
  { name: "Cypress", geneticType: "codominant" },
  { name: "Fire", geneticType: "codominant", description: "Tests for Fire A and Fire B." },
  { name: "Sulfur", geneticType: "codominant", description: "Separate Fire line." },
  { name: "Vanilla", geneticType: "codominant" },
  { name: "Disco", geneticType: "codominant" },
  { name: "Hurricane/Trick", geneticType: "dominant", description: "Test cannot differentiate between Hurricane and Trick as they are genetically identical." },
  { name: "Enchi", geneticType: "codominant" },
  { name: "Ghi", geneticType: "codominant" },
  { name: "Nr-Mandarin", geneticType: "codominant", description: "Many super Mandarins that were sold in the past also were Hypo. Consider adding a Hypo test." },
];

async function main() {
  let count = 0;

  for (let i = 0; i < MORPH_TESTS.length; i++) {
    const t = MORPH_TESTS[i];
    const code = toCode(t.name);
    const id = `morph-${code.toLowerCase()}`;
    await prisma.shedTestCatalog.upsert({
      where: { id },
      update: {},
      create: {
        id,
        name: t.name,
        shortLabel: t.name,
        geneTarget: t.name,
        category: "morph",
        pricingType: "morph",
        description: t.description || null,
        active: true,
        visibleInBreederApp: true,
        currency: "EUR",
        allowedPriorities: ["routine", "priority", "urgent"],
        sortOrder: i,
      },
    });
    count++;
  }

  // Sex determination
  await prisma.shedTestCatalog.upsert({
    where: { id: "sex-determination" },
    update: {},
    create: {
      id: "sex-determination",
      name: "Sex Determination",
      shortLabel: "Sex Det.",
      geneTarget: null,
      category: "sex-determination",
      pricingType: "sex",
      description: "Determines the animal sex from submitted shed material.",
      active: true,
      visibleInBreederApp: true,
      currency: "EUR",
      allowedPriorities: ["routine", "priority", "urgent"],
      sortOrder: MORPH_TESTS.length,
    },
  });
  count++;

  console.log(`Seeded ${count} catalog entries.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
