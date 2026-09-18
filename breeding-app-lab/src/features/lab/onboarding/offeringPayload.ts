import type { ParsedOffering } from "./parseCatalogueSheet";

/**
 * Turns a row the parser read into the body the import endpoint stores.
 *
 * The two vocabularies do not match, and that is not an accident to paper over
 * silently. The spreadsheet asks a laboratory what kind of product a test is —
 * `morph`, `sex`, `panel` — because that is the distinction a price list makes.
 * The database keeps that as `testKind` but also carries `category`, an older
 * and coarser field whose values are `morph`, `sex-determination` and `other`.
 * Translating here, once, is what keeps the sheet readable and the stored row
 * valid.
 */

/** `category` as the offerings API defines it, which is not what a sheet says. */
const CATEGORY_FOR_KIND: Record<ParsedOffering["testKind"], string> = {
  morph: "morph",
  sex: "sex-determination",
  // A bundle is not a morph test and it is not sex determination. `other` is the
  // only honest answer the coarser field has.
  panel: "other",
};

export type OfferingImportPayload = Record<string, unknown>;

/**
 * A panel is sold at one price whatever the order size — the pricing engine
 * reads `priceCents` for it and never looks at the tier table. So the first tier
 * a laboratory typed is the panel's price, and the other two are never charged.
 */
export const isFlatPriced = (offering: ParsedOffering): boolean => offering.testKind === "panel";

export const toOfferingPayload = (offering: ParsedOffering): OfferingImportPayload => {
  const flat = isFlatPriced(offering);
  return {
    name: offering.name,
    category: CATEGORY_FOR_KIND[offering.testKind],
    pricingType: offering.pricingType,
    testKind: offering.testKind,
    speciesIds: offering.speciesIds,
    priceModel: flat ? "flat" : "tier",
    priceCents: flat ? offering.tierPricesCents.t1 : null,
    // Kept on a panel too, so a laboratory that later reprices it by order size
    // does not have to retype what it already told us.
    tierPrices: offering.tierPricesCents,
    addonPriceCents: offering.addonPriceCents ?? null,
    geneTarget: offering.geneTarget ?? null,
    aliases: offering.aliases,
    availability: offering.availability,
    turnaroundDays: offering.turnaroundDays ?? null,
    description: offering.description ?? null,
  };
};

/**
 * What is true about a row that the laboratory should see before publishing,
 * but which is not a mistake and must not block the import.
 *
 * These are the quiet ones — a file that imports cleanly and then behaves in a
 * way nobody expected. They belong on the review screen, next to the row.
 */
export const noticesFor = (offering: ParsedOffering): string[] => {
  const notices: string[] = [];
  const { t1, t2, t3 } = offering.tierPricesCents;

  if (isFlatPriced(offering) && (t2 !== t1 || t3 !== t1)) {
    notices.push(
      "A panel is sold at one price whatever the order size, so this will always be charged at the first figure. "
      + "The other two will not be used."
    );
  }
  if (offering.availability === "coming_soon") {
    notices.push("Published so breeders can see it is on the way, but it cannot be ordered yet.");
  }
  if (offering.testKind === "morph" && !offering.geneTarget) {
    notices.push(
      "No gene named, so a confirmed result will be recorded but will not update the animal's genetics."
    );
  }
  if (offering.testKind === "sex" && offering.addonPriceCents === undefined) {
    notices.push(
      "No add-on price, so this is charged in full even when it is ordered alongside a morph test on the same animal."
    );
  }
  return notices;
};

/** The whole file, ready to send. */
export const toImportPayload = (
  offerings: ParsedOffering[],
  options: { dryRun?: boolean } = {}
): { offerings: OfferingImportPayload[]; dryRun?: boolean } => ({
  offerings: offerings.map(toOfferingPayload),
  ...(options.dryRun ? { dryRun: true } : {}),
});
