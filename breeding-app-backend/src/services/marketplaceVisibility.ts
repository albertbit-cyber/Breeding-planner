/**
 * What a stranger can see on the marketplace, in one place.
 *
 * These rules used to be restated wherever a listing was read, and the copies
 * had drifted: browse showed available and reserved, a listing's own page
 * showed anything by id -- drafts and moderator-hidden listings included -- and
 * a listing's photos stayed public unless the status was exactly "draft", so
 * hiding a listing hid the card and left its pictures up. Written out for
 * people in docs/marketplace-listings.md; keep the two in step.
 */

/** In the catalogue: a buyer can find it and ask about it. */
export const LISTED_STATUSES = ["available", "reserved"] as const;

/** Availability values that keep a listed card in the catalogue. */
export const LISTED_AVAILABILITY = ["available", "reserved", "featured"] as const;

/**
 * Reachable by direct link, with its photos: everything listed, plus sold
 * animals, which stay up as price comparisons. "draft", "hidden" and anything
 * archived are private to the seller and staff.
 */
export const PUBLIC_STATUSES = ["available", "reserved", "sold"] as const;

type ListingLike = { status?: string | null; archivedAt?: Date | string | null } | null | undefined;

/** Prisma filter for listings in the catalogue (the default browse). */
export const listedWhere = () => ({
  archivedAt: null,
  status: { in: [...LISTED_STATUSES] },
  availability: { in: [...LISTED_AVAILABILITY] },
});

/** A stranger may open this listing and see its photos. */
export const isListingPublic = (listing: ListingLike): boolean =>
  Boolean(
    listing &&
      !listing.archivedAt &&
      (PUBLIC_STATUSES as readonly string[]).includes(String(listing.status || ""))
  );
