import type { AnimalTestSelection, CatalogCategory, CatalogTest, PricingType } from "../types/labPricing";

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

const MORPH_TEST_NAMES = [
  "Pied",
  "Lavender Albino",
  "Yb",
  "Specter",
  "Spark",
  "Gravel",
  "Asphalt",
  "Ultramel",
  "Hypo",
  "Special",
  "Mojave",
  "Lesser/Butter",
  "Mystic/Phantom",
  "Russo",
  "Bamboo",
  "Clown",
  "Cryptic",
  "Hurricane/Trick",
  "Genetic stripe",
  "VPI Axanthic",
  "Desert ghost",
  "Puzzle",
  "Sunset",
  "Spider",
  "Woma",
  "Chocolate",
  "Wookie",
  "Spotnose",
  "Champagne",
  "Bongo",
  "Het Red Axanthic (HRA)",
  "Hidden gene woma (Hgw)",
  "Cypress",
  "Fire",
  "Vanilla",
  "Disco",
  "Monarch",
  "Lace",
  "Zebra",
  "Enchi",
  "Ghi",
  "Monsoon",
  "Nr-Mandarin",
];

const createSeed = (
  id: string,
  name: string,
  sortOrder: number,
  options: {
    description?: string;
    pricingType?: PricingType;
    category?: CatalogCategory;
    active?: boolean;
  } = {}
): LabCatalogSeed => {
  const pricingType = options.pricingType || "morph";
  const category = options.category || inferCategory(pricingType);

  return {
    id,
    internalCode: toCode(name),
    name,
    category,
    active: options.active !== false,
    description: options.description,
    pricingType,
    sortOrder,
    shortLabel: name,
    geneTarget: name,
    currency: "EUR",
    allowedPriorities: ["routine", "priority", "urgent"],
    isVisibleToBreeder: true,
  };
};

export const LAB_TEST_CATALOG_SEEDS: LabCatalogSeed[] = [
  ...MORPH_TEST_NAMES.map((name, index) =>
    createSeed(`morph-${toCode(name).toLowerCase()}`, name, index, {
      description: name === "Fire" ? "This test checks for Fire A and Fire B" : undefined,
      pricingType: "morph",
      category: "morph",
    })
  ),
  createSeed("sex-determination", "Sex Determination", MORPH_TEST_NAMES.length, {
    pricingType: "sex",
    category: "sex-determination",
    description: "Determines the animal sex from submitted material.",
  }),
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
