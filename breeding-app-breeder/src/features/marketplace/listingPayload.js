/**
 * Turns an animal from the breeder app into the body of POST /marketplace/listings.
 *
 * The breeder side and the marketplace used to write to two different tables --
 * "Publish to Marketplace" saved a row nothing on the public site ever read --
 * so this is the one place that decides what a published snake looks like to a
 * buyer. Keep it a pure function: it is the part worth testing.
 */

const PUBLISHED_STATUS = 'available';
const UNPUBLISHED_STATUS = 'draft';

const cleanText = (value) => {
  if (value === undefined || value === null) return '';
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text;
};

/**
 * The price box is free text, so it arrives as "450", "€450", "450.50" or
 * "450,50" depending on the breeder. Anything that is not a number after that
 * is dropped rather than guessed at -- a listing with no price shows "Price on
 * inquiry", which is honest; a listing with the wrong price is not.
 */
export function parseListingPrice(value) {
  const text = cleanText(value);
  // Stripping the symbols would also strip a minus sign and turn -5 into 5.
  if (text.startsWith('-')) return null;
  const raw = text.replace(/[^0-9.,]/g, '');
  if (!raw) return null;
  const normalized = raw.includes('.') ? raw.replace(/,/g, '') : raw.replace(',', '.');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

export function buildMarketplaceListingPayload(snake, options = {}) {
  if (!snake?.id) return null;

  const { genetics = '', species = '', published = true } = options;
  const price = parseListingPrice(snake.price);

  return {
    animalId: snake.id,
    title: cleanText(snake.name) || cleanText(snake.id) || 'Snake for sale',
    species: cleanText(species) || undefined,
    genetics: cleanText(genetics),
    sex: cleanText(snake.sex),
    birthDate: cleanText(snake.birthDate || snake.hatchDate) || undefined,
    // An empty string here would be stored as a price of 0, which reads as free.
    price: price === null ? '' : price,
    currency: cleanText(snake.currency) || 'EUR',
    description: cleanText(snake.saleDescription),
    // Browse only returns "available" rows, so a draft is how a snake is taken
    // back off the marketplace without deleting the listing and its messages.
    status: published ? PUBLISHED_STATUS : UNPUBLISHED_STATUS,
  };
}

const isFilled = (value) =>
  value !== undefined && value !== null && String(value).replace(/\s+/g, ' ').trim() !== '';

/**
 * An animal can be put up for sale from two places: the For Sale panel in the
 * breeder app, and the marketplace's own Sell page. Only the first writes
 * anything back to the animal record, so an animal listed from the Sell page
 * opened in the breeder app looking as though it were not for sale at all --
 * no price, no currency, the toggle off, while a live card sat on the website.
 *
 * Reconciling here rather than writing the sale facts onto the animal from the
 * server is deliberate. `shouldApplyIncomingPayload` compares an incoming
 * payload's own timestamp against the animal ROW's timestamp, and a good number
 * of animals carry no payload timestamp at all -- for those, any server write
 * to the row would make every later sync from the breeder fail the comparison
 * and be dropped on the floor. Reading the listing is free of that hazard.
 *
 * The animal record wins wherever it has something to say; the listing only
 * fills the silences.
 */
export function reconcileDraftWithListing(draft, listing) {
  if (!draft || !listing) return draft;

  const next = { ...draft, forSale: true, marketplacePublished: true };
  if (!isFilled(next.price) && listing.price !== null && listing.price !== undefined) {
    next.price = String(listing.price);
  }
  if (!isFilled(next.currency) && isFilled(listing.currency)) next.currency = listing.currency;
  if (!isFilled(next.saleDescription) && isFilled(listing.description)) {
    next.saleDescription = listing.description;
  }
  return next;
}

/**
 * Rebuilds the body for an update from the listing the marketplace already
 * holds. Needed because the update rebuilds every column from what it is sent:
 * to add a photo to an existing card you have to hand back everything else that
 * was on it, or the title, genetics and price are blanked in the process.
 */
export function listingUpdatePayloadFromListing(listing) {
  if (!listing?.id) return null;
  return {
    animalId: listing.animalId || undefined,
    title: listing.title || 'Snake for sale',
    species: listing.species || undefined,
    category: listing.category || undefined,
    genetics: listing.genetics || '',
    sex: listing.sex || '',
    birthDate: listing.birthDate || undefined,
    weight: listing.weight ?? undefined,
    price: listing.price === null || listing.price === undefined ? '' : listing.price,
    currency: listing.currency || 'EUR',
    status: listing.status || 'available',
    availability: listing.availability || listing.status || 'available',
    country: listing.country || undefined,
    city: listing.city || undefined,
    description: listing.description || '',
    feedingNotes: listing.feedingNotes || '',
    temperamentNotes: listing.temperamentNotes || '',
  };
}

/** A listing the marketplace is showing without any picture on it. */
export function listingNeedsPhoto(listing) {
  if (!listing) return false;
  if (listing.imageUrl) return false;
  return !(Array.isArray(listing.images) && listing.images.length > 0);
}
