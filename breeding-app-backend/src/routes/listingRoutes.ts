import { Router } from "express";

/**
 * Retired 2026-10-05: the legacy listings API.
 *
 * `/api/listings` wrote a second listing store (`listings`) that the
 * marketplace never read, which is how a snake could be "published" and still
 * invisible to every buyer. There is now one store, `marketplace_listings`,
 * behind `/api/marketplace`. Every path here answers 410 Gone with a pointer,
 * so a stale client fails loudly instead of writing into a table nothing reads.
 *
 * REMOVE AFTER 2027-01-05, together with the frozen `Listing` model in
 * prisma/schema.prisma. No frontend in this repo has called these routes since
 * the retirement; three months covers installed APKs and cached web builds.
 */
export const LEGACY_LISTINGS_REMOVAL_DATE = "2027-01-05";

export const listingRoutes = Router();

listingRoutes.all("*", (_req, res) => {
  res.status(410).json({
    message: "The /api/listings API is retired. Listings live in the marketplace API.",
    replacement: "/api/marketplace/listings",
    docs: "docs/marketplace-listings.md",
    removalDate: LEGACY_LISTINGS_REMOVAL_DATE,
  });
});
