import { FEATURE_CATALOG, PEDIGREE_FEATURE, PHOTOS_PER_ANIMAL_FEATURE, featureAudience } from "./subscriptionCatalog";

/**
 * Claude's suggested feature set per tier (17 Oct 2026), the starting point for the admin's tier
 * matrix. Nothing applies these on its own: the matrix shows them beside the real settings and
 * "Apply recommendation" copies them into a tier when the owner chooses to. The owner can rewrite
 * them in the admin's Suggestions page, which stores its own copy (platformSettingsService).
 *
 * The owner's brief for the shape:
 * - Free 10 animals; Hobby Keeper (key "hobby") 25 animals with few breeding tools; Hobby Breeder
 *   (key "hobby_plus") with the emphasis on breeding tools, animal cap left for the owner to set.
 * - Free and both Hobby tiers get their own pedigree; Breeder, Professional Breeder and Enterprise
 *   get the extended pedigree (every connection across breeders).
 * - Enterprise gets everything. Custom is "Build My Own": a Free base plus paid add-ons.
 * - A lab is a vendor, not a tier, so lab-portal features are not in any tier.
 */

export type Recommendation = { enabled: boolean; limit: number | null };
export type TierRecommendations = Record<string, Record<string, Recommendation>>;

const TIER_FEATURES = FEATURE_CATALOG.filter((item) => featureAudience(item.featureKey) === "tier").map((item) => item.featureKey);
const byPrefix = (prefix: string) => TIER_FEATURES.filter((key) => key.startsWith(prefix));

const animalBasics = ["animals.view", "animals.create", "animals.edit", "animals.delete", PHOTOS_PER_ANIMAL_FEATURE, "animals.notes", "animals.health_logs", "animals.feeding_logs", "animals.weight_logs", "animals.shedding_logs"];
const labOrdering = ["lab.orders", "lab.labels", "lab.status_tracking", "lab.catalog"];
const mobileBasic = ["mobile.scan", "mobile.profile", "mobile.quick_feed", "mobile.quick_weight", "mobile.quick_shed", "mobile.notes", "mobile.photos"];
const marketplaceBuyer = ["marketplace.view", "marketplace.favorite", "marketplace.contact_seller"];

const FREE = [
  ...animalBasics,
  PEDIGREE_FEATURE,
  "genetics.basic_calculator",
  "qr.generate",
  ...labOrdering,
  ...marketplaceBuyer,
  ...mobileBasic,
  "data.backup",
  "data.restore",
];

/** Hobby Keeper: husbandry first. The breeding basics only (pairings, clutches, hatchlings). */
const HOBBY_KEEPER = [
  ...FREE,
  "animals.documents",
  "breeding.pairings",
  "breeding.clutches",
  "breeding.hatchlings",
  "genetics.het_probability",
  "genetics.aliases",
  ...byPrefix("spaces.").filter((key) => key !== "spaces.capacity_planner"),
  "qr.pdf_export",
  "qr.rack_labels",
  "qr.tub_labels",
  "communication.inbox",
  "communication.activity_log",
  "lab.certificates",
  "sales.for_sale",
  "sales.price_animals",
  "marketplace.create_listing",
  "marketplace.edit_listing",
  "mobile.quick_clean",
  "mobile.quick_water",
  "mobile.tasks",
  "mobile.offline_sync",
  "data.csv_export",
  "data.pdf_export",
];

/** Hobby Breeder: the breeding season in full, and the genetics to plan it. */
const HOBBY_BREEDER = [
  ...HOBBY_KEEPER,
  "breeding.lock_tracking",
  "breeding.ovulation_tracking",
  "breeding.egg_tracking",
  "breeding.calendar",
  "breeding.pairing_recommendations",
  "breeding.advisor",
  "genetics.advanced_calculator",
  "genetics.bel_helper",
  "genetics.morph_id",
  "genetics.visual_comparison",
  "spaces.capacity_planner",
  "qr.custom_labels",
  "qr.shed_label_packs",
  "communication.telegram",
  "communication.telegram_updates",
  "communication.telegram_confirmation",
  "lab.auto_update_genetics",
  "sales.reservations",
  "sales.buyer_records",
  "sales.history",
  "marketplace.store_page",
  "mobile.rack_mode",
  "mobile.lab",
  "mobile.sales",
  "mobile.communication",
  "ai.breeding_advisor",
];

/** Breeder: everything for breeding and pedigree, extended pedigree included. No team or API. */
const BREEDER_EXCLUDED = new Set(["team.members", "team.role_permissions", "mobile.team_workflow", "data.api_access", "data.webhooks", "data.integrations"]);
const BREEDER = TIER_FEATURES.filter((key) => !BREEDER_EXCLUDED.has(key));

const ALL = TIER_FEATURES;

const build = (enabledKeys: string[], limits: Record<string, number | null> = {}): Record<string, Recommendation> => {
  const enabled = new Set(enabledKeys);
  return Object.fromEntries(
    TIER_FEATURES.map((key) => [key, { enabled: enabled.has(key), limit: enabled.has(key) ? limits[key] ?? null : null }])
  );
};

export const DEFAULT_TIER_RECOMMENDATIONS: TierRecommendations = {
  free: build(FREE, {
    "animals.create": 10,
    [PHOTOS_PER_ANIMAL_FEATURE]: 3,
    "qr.generate": 10,
    "lab.orders": 5,
  }),
  hobby: build(HOBBY_KEEPER, {
    "animals.create": 25,
    [PHOTOS_PER_ANIMAL_FEATURE]: 5,
    "spaces.racks": 3,
    "spaces.rooms": 1,
    "qr.pdf_export": 25,
    "lab.orders": 20,
    "marketplace.create_listing": 5,
  }),
  // The animal cap is the owner's to set (50 or 100); 100 is what the database holds today.
  hobby_plus: build(HOBBY_BREEDER, {
    "animals.create": 100,
    [PHOTOS_PER_ANIMAL_FEATURE]: 7,
    "spaces.racks": 10,
    "spaces.rooms": 3,
    "qr.pdf_export": 100,
    "communication.telegram_updates": 100,
    "ai.breeding_advisor": 25,
    "lab.orders": 50,
    "marketplace.create_listing": 15,
  }),
  breeder: build(BREEDER, {
    "animals.create": 250,
    [PHOTOS_PER_ANIMAL_FEATURE]: 9,
    "qr.pdf_export": 500,
    "communication.telegram_updates": 500,
    "ai.breeding_advisor": 100,
    "lab.orders": 200,
    "sales.morphmarket_export": 50,
    "marketplace.create_listing": 50,
  }),
  professional_breeder: build(ALL, {
    "animals.create": 500,
    "team.members": 5,
    "marketplace.create_listing": 200,
  }),
  enterprise: build(ALL),
  // "Build My Own": the Free base. Everything else is bought feature by feature as an add-on.
  custom: build(FREE, {
    "animals.create": 10,
    [PHOTOS_PER_ANIMAL_FEATURE]: 3,
  }),
};

