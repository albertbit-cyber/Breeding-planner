import type { AnimalTestSelection, CatalogCategory, CatalogTest, GeneticType, PricingType } from "../types/labPricing";

export type LabCatalogSeed = CatalogTest & {
  internalCode: string;
  shortLabel?: string;
  geneTarget?: string;
  currency: string;
  allowedPriorities: Array<"routine" | "priority" | "urgent">;
  isVisibleToBreeder: boolean;
};

const CATALOG_LAB_ID = "proherper-main-lab";

const toCode = (name: string): string =>
  String(name || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "CATALOG_TEST";

const inferCategory = (pricingType: PricingType): CatalogCategory => {
  if (pricingType === "sex") return "sex-determination";
  return "morph";
};

interface MorphDef {
  name: string;
  geneticType: GeneticType;
  group?: string;
  description?: string;
}

// All morph tests, classified by genetic type and complex group
const MORPH_TESTS: MorphDef[] = [
  // ── Recessive ────────────────────────────────────────────────────
  { name: "Pied",                        geneticType: "recessive" },
  { name: "Lavender Albino",             geneticType: "recessive" },
  { name: "Ultramel",                    geneticType: "recessive", description: "Two lines exist; only one can be tested (the rare NoCo line cannot be tested)." },
  { name: "Hypo",                        geneticType: "recessive", description: "Also known as Orange Ghost." },
  { name: "Clown",                       geneticType: "recessive", description: "Tests Clown only; does not check Cryptic." },
  { name: "Cryptic",                     geneticType: "recessive", description: "Tests Cryptic only; does not check Clown." },
  { name: "Genetic stripe",              geneticType: "recessive" },
  { name: "VPI Axanthic",                geneticType: "recessive", description: "Cannot be used to check TSK, MJ, or other Axanthic lines." },
  { name: "Desert ghost",                geneticType: "recessive" },
  { name: "Puzzle",                      geneticType: "recessive" },
  { name: "Sunset",                      geneticType: "recessive" },
  { name: "Monarch",                     geneticType: "recessive", description: "Two lines of Monarch exist; this test checks both." },
  { name: "Lace",                        geneticType: "recessive" },
  { name: "Zebra",                       geneticType: "recessive" },
  { name: "Rainbow",                     geneticType: "recessive" },
  { name: "Monsoon",                     geneticType: "recessive", description: "Holdback test — 99% accurate. Cannot be used for definitive results." },

  // ── Codominant / Dominant ────────────────────────────────────────
  // YB Complex
  { name: "Yb",                          geneticType: "codominant", group: "YB Complex" },
  { name: "Specter",                     geneticType: "codominant", group: "YB Complex" },
  { name: "Spark",                       geneticType: "codominant", group: "YB Complex" },
  { name: "Gravel",                      geneticType: "codominant", group: "YB Complex" },
  { name: "Asphalt",                     geneticType: "codominant", group: "YB Complex" },

  // BEL Complex
  { name: "Special",                     geneticType: "codominant", group: "BEL Complex" },
  { name: "Mojave",                      geneticType: "codominant", group: "BEL Complex" },
  { name: "Lesser/Butter",               geneticType: "codominant", group: "BEL Complex" },
  { name: "Mystic/Phantom",              geneticType: "codominant", group: "BEL Complex" },
  { name: "Russo",                       geneticType: "codominant", group: "BEL Complex" },
  { name: "Bamboo",                      geneticType: "codominant", group: "BEL Complex" },

  // Spider Complex
  { name: "Spider",                      geneticType: "dominant",   group: "Spider Complex" },
  { name: "Woma",                        geneticType: "dominant",   group: "Spider Complex" },
  { name: "Chocolate",                   geneticType: "dominant",   group: "Spider Complex" },
  { name: "Wookie",                      geneticType: "dominant",   group: "Spider Complex" },
  { name: "Spotnose",                    geneticType: "codominant", group: "Spider Complex" },
  { name: "Champagne",                   geneticType: "dominant",   group: "Spider Complex" },
  { name: "Bongo",                       geneticType: "dominant",   group: "Spider Complex" },
  { name: "Het Red Axanthic (HRA)",      geneticType: "codominant", group: "Spider Complex" },
  { name: "Hidden gene woma (Hgw)",      geneticType: "codominant", group: "Spider Complex" },
  { name: "Cypress",                     geneticType: "codominant", group: "Spider Complex" },

  // Fire Complex (Black eyed leucistic)
  { name: "Fire",                        geneticType: "codominant", group: "Fire Complex", description: "Tests for Fire A and Fire B." },
  { name: "Sulfur",                      geneticType: "codominant", group: "Fire Complex", description: "Separate Fire line." },
  { name: "Vanilla",                     geneticType: "codominant", group: "Fire Complex" },
  { name: "Disco",                       geneticType: "codominant", group: "Fire Complex" },

  // Individual codominants / dominants
  { name: "Hurricane/Trick",             geneticType: "dominant",   description: "Test cannot differentiate between Hurricane and Trick as they are genetically identical." },
  { name: "Enchi",                       geneticType: "codominant" },
  { name: "Ghi",                         geneticType: "codominant" },
  { name: "Nr-Mandarin",                 geneticType: "codominant", description: "Many super Mandarins that were sold in the past also were Hypo. Consider adding a Hypo test." },
];

const createSeed = (
  id: string,
  def: MorphDef,
  sortOrder: number,
  options: { pricingType?: PricingType; category?: CatalogCategory; active?: boolean } = {}
): LabCatalogSeed => {
  const pricingType = options.pricingType || "morph";
  const category = options.category || inferCategory(pricingType);

  return {
    id,
    internalCode: toCode(def.name),
    name: def.name,
    category,
    active: options.active !== false,
    description: def.description,
    pricingType,
    sortOrder,
    shortLabel: def.name,
    geneTarget: def.name,
    currency: "EUR",
    allowedPriorities: ["routine", "priority", "urgent"],
    isVisibleToBreeder: true,
    geneticType: def.geneticType,
    group: def.group,
  };
};

export const LAB_TEST_CATALOG_SEEDS: LabCatalogSeed[] = [
  ...MORPH_TESTS.map((def, index) =>
    createSeed(`morph-${toCode(def.name).toLowerCase()}`, def, index, {
      pricingType: "morph",
      category: "morph",
    })
  ),
  {
    id: "sex-determination",
    internalCode: "SEX_DETERMINATION",
    name: "Sex Determination",
    category: "sex-determination",
    active: true,
    description: "Determines the animal sex from submitted shed material.",
    pricingType: "sex",
    sortOrder: MORPH_TESTS.length,
    shortLabel: "Sex Det.",
    geneTarget: undefined,
    currency: "EUR",
    allowedPriorities: ["routine", "priority", "urgent"],
    isVisibleToBreeder: true,
    geneticType: undefined,
    group: undefined,
  },
];

export const DEFAULT_CATALOG_LAB_ID = CATALOG_LAB_ID;

export const LAB_PRICING_EXAMPLE_ORDERS: AnimalTestSelection[][] = [
  [
    {
      animalId: "animal-1",
      selectedTestIds: ["morph-clown", "morph-pied"],
    },
  ],
  [
    {
      animalId: "animal-1",
      selectedTestIds: ["morph-ultramel", "morph-clown", "morph-pied", "sex-determination"],
    },
  ],
  [
    {
      animalId: "animal-1",
      selectedTestIds: ["sex-determination"],
    },
    {
      animalId: "animal-2",
      selectedTestIds: ["morph-clown", "morph-pied"],
    },
    {
      animalId: "animal-3",
      selectedTestIds: ["morph-ultramel", "sex-determination"],
    },
  ],
];
