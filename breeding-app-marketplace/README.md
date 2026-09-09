# breeding-app-marketplace

Serpentora Market — the public marketplace where breeders list animals together
with the record behind them: weights, feeding history, lineage, and lab-verified
genetics.

## What it is

Browsing, filtering, opening a listing and opening a breeder's store are public
and need no account. Signing in is asked for at the moment of an action that
needs an identity — saving an animal, messaging a seller, making an offer,
saving a search, or listing something of your own.

The thesis of the product is one line: **a listing is a documented specimen with
a price on it, not an advertisement.** `MarketplaceListing.animalId` links a
listing to the seller's own animal record, and `publicDataSettings` is the
switchboard that decides how much of that record is published. The four-segment
*provenance meter* on every card counts what is actually attached — photos, a
weight history, lineage, a lab certificate — so it cannot be inflated by
toggling a switch over an empty log.

## Routes

| Route | Screen | Access |
|---|---|---|
| `/` | Browse — search, filters, catalogue | Public |
| `/a/:id` | Listing | Public |
| `/s/:userId` | Breeder store | Public |
| `/saved` | Favourites, saved searches, reviews to write | Signed in |
| `/inbox`, `/inbox/:conversationId` | Conversations, offers, deal state | Signed in |
| `/sell`, `/sell/:listingId` | List an animal from your collection | Breeder |
| `/dashboard` | What needs your reply, listings, numbers | Breeder |
| `/pricing` | Plans | Public |

Marketplace moderation lives in `breeding-app-admin` at `/admin/marketplace`,
not here.

## Backend

Set `VITE_API_URL` to the shared backend API base URL. The app also reads
uploaded listing photos from that origin (`/marketplace/media/:id`), so the API
must be reachable from the browser, not only from the build.

Deep links need the server to serve `index.html` for unknown paths and the build
to use an absolute asset base — both are already configured (`netlify.toml` and
`vite.config.mts`).

## Styling

`src/marketplace/marketplace.css` is the marketplace's own stylesheet, built on
the shared skin tokens in `breeding-app-shared/src/styles/skins.css`. Structure
comes from `--sk-*`; only the categorical hues (gene coral and violet, the tab
set, marketplace clay) are defined locally, because their meaning is fixed
across the suite. `src/App.css` now holds only the auth overlay and pricing
page, which are still the versions shared with the other frontends.

## Commands

```bash
npm install
npm run dev
npm run build
npm test
```
