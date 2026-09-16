/**
 * Deciding whether a listing is the animal a buyer asked to be told about.
 *
 * Kept free of Prisma so it can be tested directly: this is the part that will
 * either earn the feature or bury people in mail about snakes they did not ask
 * for, and it is much easier to get right when it can be exercised in isolation.
 */

export type WishlistCriteria = {
  species?: string | null;
  includeGenes?: string[] | null;
  excludeGenes?: string[] | null;
  sex?: string | null;
  maxPrice?: number | string | null;
  country?: string | null;
  isActive?: boolean;
};

export type ListingFacts = {
  species?: string | null;
  genetics?: string | null;
  sex?: string | null;
  price?: number | string | null;
  country?: string | null;
};

const normalize = (value: unknown): string =>
  String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();

const numberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Genetics arrive as one string -- "Phantom, Het Ultramel, 50% Het Sunset".
 * Splitting on the separators a keeper actually types and matching inside a
 * single token stops a gene matching across a comma: "pastel clown" must not be
 * satisfied by a listing that happens to carry Pastel and, separately, Clown.
 */
export const geneticsTokens = (genetics: unknown): string[] =>
  normalize(genetics)
    .split(/[,/|]+/)
    .map((token) => token.trim())
    .filter(Boolean);

export const cleanGeneList = (value: unknown): string[] => {
  const source = Array.isArray(value)
    ? value
    : String(value ?? "").split(",");
  const seen = new Set<string>();
  const out: string[] = [];
  source.forEach((item) => {
    const gene = normalize(item);
    if (!gene || seen.has(gene)) return;
    seen.add(gene);
    out.push(gene);
  });
  return out.slice(0, 12);
};

const carriesGene = (tokens: string[], gene: string): boolean =>
  tokens.some((token) => token.includes(gene));

/**
 * Every wanted gene must be present, no unwanted one may be, and each remaining
 * field only narrows when the buyer actually set it. An empty wishlist matches
 * nothing rather than everything: a saved entry with no criteria is a mistake,
 * and answering it with the whole catalogue would be the worst reading of it.
 */
export const listingMatchesWishlist = (listing: ListingFacts, wishlist: WishlistCriteria): boolean => {
  if (wishlist.isActive === false) return false;

  const include = cleanGeneList(wishlist.includeGenes);
  const exclude = cleanGeneList(wishlist.excludeGenes);
  const species = normalize(wishlist.species);
  const sex = normalize(wishlist.sex);
  const country = normalize(wishlist.country);
  const maxPrice = numberOrNull(wishlist.maxPrice);

  const hasCriteria =
    include.length > 0 || exclude.length > 0 || !!species || !!sex || !!country || maxPrice !== null;
  if (!hasCriteria) return false;

  const tokens = geneticsTokens(listing.genetics);

  if (include.length && !include.every((gene) => carriesGene(tokens, gene))) return false;
  if (exclude.length && exclude.some((gene) => carriesGene(tokens, gene))) return false;

  if (species && species !== "any" && normalize(listing.species) !== species) return false;
  if (sex && normalize(listing.sex) !== sex) return false;
  if (country && !normalize(listing.country).includes(country)) return false;

  if (maxPrice !== null) {
    const price = numberOrNull(listing.price);
    // A listing with no price is "price on inquiry". It cannot be shown to clear
    // a ceiling, so a buyer who set one is not told about it.
    if (price === null || price > maxPrice) return false;
  }

  return true;
};

/** A short, readable reason for the notification: what the buyer asked for. */
export const describeWishlist = (wishlist: WishlistCriteria): string => {
  const include = cleanGeneList(wishlist.includeGenes);
  const parts: string[] = [];
  if (include.length) parts.push(include.join(" + "));
  if (wishlist.sex) parts.push(normalize(wishlist.sex));
  const maxPrice = numberOrNull(wishlist.maxPrice);
  if (maxPrice !== null) parts.push(`under ${maxPrice}`);
  return parts.join(", ");
};
