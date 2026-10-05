# Marketplace listings: one store, and what makes a listing visible

Written for anyone changing how listings are published, browsed or moderated.
The rules below are implemented in one file,
`breeding-app-backend/src/services/marketplaceVisibility.ts`; if you change one, change both.

## One store

Every listing lives in `marketplace_listings` (`MarketplaceListing`), behind `/api/marketplace`.
The marketplace site, the breeder profile, inquiries, reports and the admin console all read it.

The legacy `listings` table (`Listing`, `/api/listings`) was retired on 2026-10-05:

- `/api/listings/*` answers **410 Gone** with `replacement: "/api/marketplace/listings"`.
- The table is frozen, not dropped. Nothing writes it. Old inquiries, moderation audits and reports
  keep their legacy link, and the account data export still includes the rows.
- `scripts/copyLegacyListings.ts` (`npm run listings:copy-legacy:local`) copies legacy rows into
  `marketplace_listings` and relinks their inquiries and reports. It runs against a local database
  only, and refuses anything else.
- The router stub and the `Listing` model are removed **no earlier than 2027-01-05**.

Why it mattered: the breeder app's "Publish to Marketplace" once wrote only to the legacy table,
so a snake could be published and stay invisible to every buyer.

## Publishing (breeder app)

A publish is one request: `POST /api/marketplace/listings` with

| Field | Value |
|---|---|
| `status` | `"available"` to publish, `"draft"` to take the animal off sale |
| `price`, `currency` | from the animal's For Sale panel; no price means "price on inquiry", never 0 |
| `images` | the cover photo, `isPrimary: true` |
| `mediaIds` | the upload behind that photo, if it was uploaded rather than linked |

The photo is uploaded first, unattached (`POST /api/marketplace/uploads` without a `listingId`).
An unattached upload is visible only to its owner. The listing request names it in `mediaIds` and
the server attaches it in the same transaction that sets the status. Only the seller's own,
still-unattached uploads can be attached that way.

The endpoint is upsert-by-(seller, animal): publishing the same animal again updates its card.
Leaving `images` out keeps the photos a card already has; it does not remove them.

The snapshot sync never writes a listing. Tagging an animal "for sale" in a synced record does not
publish it; only the explicit publish does.

## What makes a listing visible

| | Catalogue (browse, profile, inquiries) | Own page by link | Photos |
|---|---|---|---|
| `available` | yes | yes | public |
| `reserved` | yes | yes | public |
| `sold` | only with `includeSold` (price comparison) | yes | public |
| `draft` | no | seller and staff only | seller and staff only |
| `hidden` | no | seller and staff only | seller and staff only |
| archived (`archivedAt` set), any status | no | seller and staff only | seller and staff only |

In the catalogue a listing also needs an `availability` of `available`, `reserved` or `featured`.
An inquiry additionally needs an active seller.

A page or photo that a visitor may not see answers **404**, exactly as a listing that does not
exist would. That rule was added on 2026-10-05. Before that, a listing's page was served to anyone
with its id whatever its status, and photos stayed public unless the status was exactly `draft`.

## What hides a listing

- **The seller unpublishes** (For Sale switched off in the breeder app): status `draft`.
- **The seller archives it:** `PATCH /marketplace/listings/:id/status` with `archived`, which sets
  `archivedAt`.
- **A moderator removes it** from a report (`remove_listing` in the admin console): status
  `hidden`. Only reports linked to a marketplace listing can do this; a report that names only a
  retired legacy row has nothing live to hide.
- **It sells:** status `sold`. It leaves the catalogue but stays reachable as a comparison.

Hiding never deletes. Conversations, favourites and sales attached to the listing are kept.
