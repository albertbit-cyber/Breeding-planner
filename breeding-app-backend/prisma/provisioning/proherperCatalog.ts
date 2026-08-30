/**
 * ProHerper Labs' published catalogue, transcribed from
 * https://www.proherper.com/en/genetic-tests (captured 2026-08-30).
 *
 * Nothing here is inferred. Where the source did not state something — panel
 * membership above all — it is left unresolved rather than guessed, because a
 * panel priced as though it were empty would misquote a real customer.
 *
 * This is ProHerper's own product list, not a platform default. Every other
 * laboratory builds its own through the Lab Portal.
 */

/**
 * Species ids come from the platform taxonomy, not from ProHerper's page. The
 * page names them scientifically; a breeder's animal carries a slug. Using the
 * scientific ids is what made the first import match nothing at all.
 */
export const PROHERPER_SERVED_SPECIES = [
  "ball-python",
  "corn-snake",
  "boa-constrictor",
  "burmese-python",
  "green-tree-python",
  // Covered by the colubrid sex determination test.
  "hognose-snake",
  "kingsnake",
  "rat-snake",
  "bullsnake",
  "garter-snake",
];

/** The six species ProHerper's single colubrid sex test covers. */
const COLUBRID_SPECIES = [
  "corn-snake",
  "hognose-snake",
  "kingsnake",
  "rat-snake",
  "bullsnake",
  "garter-snake",
];

export type ProHerperOffering = {
  /** Stable id, so re-running provisioning updates rather than duplicates. */
  key: string;
  name: string;
  testKind: "morph" | "sex" | "panel";
  pricingType: "morph" | "sex";
  category: string;
  /** One or more platform species ids. */
  speciesIds: string[];
  aliases?: string[];
  availability?: "available" | "coming_soon";
  priceModel?: "tier" | "flat";
  /** Flat price in cents, for panels. */
  priceCents?: number;
  /** Per-offering tier prices in cents, when this test is priced off-scale. */
  tierPricesCents?: { t1: number; t2: number; t3: number };
  /** Price in cents when bundled onto a morph test on the same animal. */
  addonPriceCents?: number;
  description?: string;
  panelScope?: string;
  sortOrder: number;
};

const bp = (
  key: string,
  name: string,
  sortOrder: number,
  extra: Partial<ProHerperOffering> = {}
): ProHerperOffering => ({
  key,
  name,
  testKind: "morph",
  pricingType: "morph",
  category: "morph",
  speciesIds: ["ball-python"],
  sortOrder,
  ...extra,
});

const morphFor = (
  speciesId: string,
  key: string,
  name: string,
  sortOrder: number,
  extra: Partial<ProHerperOffering> = {}
): ProHerperOffering => ({
  key,
  name,
  testKind: "morph",
  pricingType: "morph",
  category: "morph",
  speciesIds: [speciesId],
  sortOrder,
  ...extra,
});

// ── Ball python morph tests (52: 50 available, 2 coming soon) ────────────────
const BALL_PYTHON_MORPHS: ProHerperOffering[] = [
  bp("bp_pied", "Pied", 1),
  bp("bp_candy_toffee", "Candy/Toffee", 2, { aliases: ["Candy", "Toffee"] }),
  bp("bp_dark_matter", "Dark Matter", 3),
  bp("bp_lavender_albino", "Lavender Albino", 4),
  bp("bp_ultramel", "Ultramel", 5),
  bp("bp_yellow_belly", "Yellow belly (Yb)", 6, { aliases: ["Yb", "Yellowbelly"] }),
  bp("bp_specter", "Specter", 7),
  bp("bp_spark", "Spark", 8),
  bp("bp_gravel", "Gravel", 9),
  bp("bp_asphalt", "Asphalt", 10),
  bp("bp_hypo_orange_ghost", "Hypo/Orange ghost", 11, { aliases: ["Hypo", "Orange ghost"] }),
  bp("bp_special", "Special", 12),
  bp("bp_special_noco", "Special (NoCo line)", 13, { aliases: ["NoCo Special"] }),
  bp("bp_mojave", "Mojave", 14),
  bp("bp_lesser_butter", "Lesser/Butter", 15, { aliases: ["Lesser", "Butter"] }),
  bp("bp_mystic_phantom", "Mystic/Phantom", 16, { aliases: ["Mystic", "Phantom"] }),
  bp("bp_russo", "Russo", 17),
  bp("bp_bamboo", "Bamboo", 18),
  bp("bp_mocha", "Mocha", 19),
  bp("bp_het_red_axanthic", "Het Red Axanthic (HRA)", 20, { aliases: ["HRA", "Red Axanthic"] }),
  bp("bp_enchi", "Enchi", 21),
  bp("bp_black_pastel", "Black pastel", 22, { availability: "coming_soon" }),
  bp("bp_cinnamon", "Cinnamon", 23, { availability: "coming_soon" }),
  bp("bp_huffman", "Huffman", 24),
  bp("bp_clown", "Clown", 25),
  bp("bp_cryptic", "Cryptic/Migraine/Gizmo/Amur", 26, {
    aliases: ["Cryptic", "Migraine", "Gizmo", "Amur"],
  }),
  bp("bp_hurricane", "Hurricane/Trick/Blitz", 27, { aliases: ["Hurricane", "Trick", "Blitz"] }),
  bp("bp_genetic_stripe", "Genetic stripe", 28),
  bp("bp_vpi_axanthic", "VPI Axanthic", 29),
  bp("bp_desert_ghost", "Desert ghost", 30, { aliases: ["DG"] }),
  bp("bp_puzzle", "Puzzle", 31),
  bp("bp_sunset", "Sunset", 32),
  bp("bp_fire", "Fire", 33),
  bp("bp_sulfur", "Sulfur", 34),
  bp("bp_vanilla", "Vanilla", 35),
  bp("bp_disco", "Disco", 36),
  bp("bp_spider", "Spider", 37),
  bp("bp_woma", "Woma", 38),
  bp("bp_chocolate", "Chocolate", 39),
  bp("bp_wookie", "Wookie", 40),
  bp("bp_spotnose", "Spotnose", 41),
  bp("bp_champagne", "Champagne", 42),
  bp("bp_bongo", "Bongo", 43),
  bp("bp_hidden_gene_woma", "Hidden gene woma (Hgw)", 44, { aliases: ["Hgw", "HGW"] }),
  bp("bp_cypress", "Cypress", 45),
  bp("bp_monarch", "Monarch", 46),
  bp("bp_lace", "Lace", 47),
  bp("bp_zebra", "Zebra", 48),
  bp("bp_ghi", "Ghi", 49, { aliases: ["GHI"] }),
  bp("bp_monsoon", "Monsoon (Holdback test)", 50, {
    aliases: ["Monsoon"],
    description: "Listed by ProHerper as a holdback test.",
  }),
  bp("bp_nr_mandarin", "NR Mandarin (Mandarin)", 51, { aliases: ["Mandarin", "NR Mandarin"] }),
  bp("bp_rainbow", "Rainbow", 52),
];

// ── Other species (8 morph tests) ────────────────────────────────────────────
const OTHER_SPECIES_MORPHS: ProHerperOffering[] = [
  morphFor("corn-snake", "cs_scaleless", "Scaleless", 60),
  morphFor("corn-snake", "cs_microscale", "Microscale", 61),
  morphFor("corn-snake", "cs_lavender", "Lavender", 62),
  morphFor("corn-snake", "cs_terrazzo", "Terrazzo", 63),
  morphFor("boa-constrictor", "boa_kahl_albino", "Kahl Albino", 70),
  morphFor("boa-constrictor", "boa_vpi_albino", "VPI Albino", 71),
  morphFor("boa-constrictor", "boa_anery_type_i", "Anery Type I", 72, {
    aliases: ["Anerythristic Type I"],
  }),
  morphFor("burmese-python", "burm_piebald", "Piebald", 80, {
    aliases: ["Pied"],
  }),
];

// ── Sex determination (3) ────────────────────────────────────────────────────
const SEX_TESTS: ProHerperOffering[] = [
  {
    key: "sex_ball_python",
    name: "Genetic sex determination — Ball python",
    testKind: "sex",
    pricingType: "sex",
    category: "sex-determination",
    speciesIds: ["ball-python"],
    // Sold at EUR 10 when added to a morph test on the same animal.
    addonPriceCents: 1000,
    description:
      "ProHerper is working on expanding this test to other python species.",
    sortOrder: 90,
  },
  {
    key: "sex_green_tree_python",
    name: "Genetic sex determination — Green tree python",
    testKind: "sex",
    pricingType: "sex",
    category: "sex-determination",
    speciesIds: ["green-tree-python"],
    // Priced on its own scale, roughly double the standard sex test.
    tierPricesCents: { t1: 6500, t2: 6000, t3: 5500 },
    description:
      "ProHerper is working on expanding the sex test to other Morelia species.",
    sortOrder: 91,
  },
  {
    key: "sex_colubrid",
    name: "Genetic sex determination — Colubrid snakes",
    testKind: "sex",
    pricingType: "sex",
    category: "sex-determination",
    speciesIds: COLUBRID_SPECIES,
    description:
      "Corn snake, hognose, king snake, rat snake, bull snake, garter snake, grass snake and many others. Contact ProHerper if you are unsure whether it will work for your species.",
    sortOrder: 92,
  },
];

// ── Panels (5) ───────────────────────────────────────────────────────────────
//
// Flat-priced, and the same turnaround as any other morph test. Membership for
// three of them is not published; those ship with an empty member list, which
// the Lab Portal shows as unresolved rather than pricing as empty.
const PANELS: ProHerperOffering[] = [
  {
    key: "panel_full",
    name: "Full panel test",
    testKind: "panel",
    pricingType: "morph",
    category: "morph",
    speciesIds: ["ball-python"],
    priceModel: "flat",
    priceCents: 12500,
    panelScope: "Checks all available morph tests.",
    sortOrder: 100,
  },
  {
    key: "panel_dinker",
    name: "Dinker panel test",
    testKind: "panel",
    pricingType: "morph",
    category: "morph",
    speciesIds: ["ball-python"],
    priceModel: "flat",
    priceCents: 19500,
    panelScope:
      "Checks all available morph tests, and whether the morph is allelic to any known morph. A homozygous (super/visual) sample is recommended.",
    sortOrder: 101,
  },
  {
    key: "panel_recessive",
    name: "Recessive panel test",
    testKind: "panel",
    pricingType: "morph",
    category: "morph",
    speciesIds: ["ball-python"],
    priceModel: "flat",
    priceCents: 9500,
    panelScope: "Checks all available recessive morphs.",
    sortOrder: 102,
  },
  {
    key: "panel_spider_complex",
    name: "Spider complex test",
    testKind: "panel",
    pricingType: "morph",
    category: "morph",
    speciesIds: ["ball-python"],
    priceModel: "flat",
    priceCents: 8000,
    panelScope: "Checks all available Spider complex morphs.",
    sortOrder: 103,
  },
  {
    key: "panel_bel_complex",
    name: "BEL complex test",
    testKind: "panel",
    pricingType: "morph",
    category: "morph",
    speciesIds: ["ball-python"],
    priceModel: "flat",
    priceCents: 8000,
    panelScope: "Checks all available BEL (Blue-Eyed Leucistic) complex morphs.",
    sortOrder: 104,
  },
];

/**
 * Panels whose membership ProHerper resolves by rule rather than by a published
 * list. `panel_full` and `panel_dinker` can be derived — every available ball
 * python morph test — so provisioning fills them in. The other three depend on
 * inheritance and complex groupings ProHerper has not published, and are left
 * empty for the laboratory to confirm.
 */
export const PANEL_MEMBERSHIP_RULES: Record<string, "all_available_bp_morphs" | "unresolved"> = {
  panel_full: "all_available_bp_morphs",
  panel_dinker: "all_available_bp_morphs",
  panel_recessive: "unresolved",
  panel_spider_complex: "unresolved",
  panel_bel_complex: "unresolved",
};

export const PROHERPER_OFFERINGS: ProHerperOffering[] = [
  ...BALL_PYTHON_MORPHS,
  ...OTHER_SPECIES_MORPHS,
  ...SEX_TESTS,
  ...PANELS,
];

/** Tier table, in the units the PricingConfig columns use (euros, not cents). */
export const PROHERPER_TIER_PRICING = {
  currency: "EUR",
  morphTier1to9FirstTest: 35,
  morphTier1to9AdditionalTest: 20,
  morphTier10to49FirstTest: 30,
  morphTier10to49AdditionalTest: 20,
  morphTier50PlusFirstTest: 25,
  morphTier50PlusAdditionalTest: 20,
  sexTier1to9: 30,
  sexTier10to49: 25,
  sexTier50Plus: 20,
};
