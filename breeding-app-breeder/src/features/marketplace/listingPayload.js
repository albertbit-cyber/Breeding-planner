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
