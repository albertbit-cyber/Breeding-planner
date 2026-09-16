import { describe, expect, it } from 'vitest';
import {
  buildMarketplaceListingPayload,
  parseListingPrice,
  reconcileDraftWithListing,
} from './listingPayload';

const snake = {
  id: '26-M-004',
  name: 'Kingsley',
  sex: 'Male',
  price: '450',
  currency: 'GBP',
  saleDescription: 'Feeding on frozen-thawed rats, never refused.',
  birthDate: '2026-06-01',
};

const opts = { genetics: 'Clown, het Pied', species: 'Ball python' };

describe('buildMarketplaceListingPayload', () => {
  it('carries the four things a buyer is shown', () => {
    const payload = buildMarketplaceListingPayload(snake, opts);

    expect(payload).toMatchObject({
      genetics: 'Clown, het Pied',
      price: 450,
      currency: 'GBP',
      description: 'Feeding on frozen-thawed rats, never refused.',
    });
  });

  it('publishes as available so the animal shows up in browse', () => {
    expect(buildMarketplaceListingPayload(snake, opts).status).toBe('available');
  });

  it('sends a draft when the animal is taken off sale', () => {
    expect(buildMarketplaceListingPayload(snake, { ...opts, published: false }).status).toBe('draft');
  });

  it('links the listing to the animal so re-publishing updates one card', () => {
    expect(buildMarketplaceListingPayload(snake, opts).animalId).toBe('26-M-004');
  });

  it('defaults the currency to EUR and falls back to the ID for a nameless animal', () => {
    const payload = buildMarketplaceListingPayload({ id: '26-F-011' }, opts);
    expect(payload.currency).toBe('EUR');
    expect(payload.title).toBe('26-F-011');
  });

  it('leaves the price empty rather than sending a zero when none was typed', () => {
    expect(buildMarketplaceListingPayload({ ...snake, price: '' }, opts).price).toBe('');
  });

  it('ignores an animal with no ID', () => {
    expect(buildMarketplaceListingPayload({ name: 'Nameless' }, opts)).toBeNull();
  });
});

describe('parseListingPrice', () => {
  it('reads the ways a breeder actually types a price', () => {
    expect(parseListingPrice('450')).toBe(450);
    expect(parseListingPrice('€450')).toBe(450);
    expect(parseListingPrice('450.50')).toBe(450.5);
    expect(parseListingPrice('450,50')).toBe(450.5);
    expect(parseListingPrice('1,200.00')).toBe(1200);
    expect(parseListingPrice(450)).toBe(450);
  });

  it('drops anything it cannot read instead of guessing', () => {
    expect(parseListingPrice('')).toBeNull();
    expect(parseListingPrice('ask me')).toBeNull();
    expect(parseListingPrice(undefined)).toBeNull();
    expect(parseListingPrice(-5)).toBeNull();
  });
});

/**
 * The description was suspected of never persisting, because no animal in the
 * live account had one saved. Nothing in the chain strips it -- the sync only
 * removes `data:` media, and the server merge is a plain spread -- so these
 * pin the leg that was actually in doubt: a description typed in the editor
 * reaches the listing body unaltered.
 */
describe('the buyer description survives the trip', () => {
  const typed = 'Feeding on frozen-thawed rats every 10 days. Never refused, calm to handle.';

  it('carries what the breeder typed through to the listing', () => {
    const payload = buildMarketplaceListingPayload(
      { ...snake, saleDescription: typed }, opts,
    );
    expect(payload.description).toBe(typed);
  });

  it('does not invent one when the box is left empty', () => {
    expect(buildMarketplaceListingPayload({ ...snake, saleDescription: '' }, opts).description).toBe('');
    expect(buildMarketplaceListingPayload({ ...snake, saleDescription: undefined }, opts).description).toBe('');
  });

  it('keeps a description when the animal is taken off sale, so it comes back with it', () => {
    const payload = buildMarketplaceListingPayload(
      { ...snake, saleDescription: typed }, { ...opts, published: false },
    );
    expect(payload.status).toBe('draft');
    expect(payload.description).toBe(typed);
  });
});

/** An animal listed from the marketplace's Sell page writes nothing to the animal record. */
describe('reconcileDraftWithListing', () => {
  const listing = { price: 1000, currency: 'GBP', description: 'From the Sell page.' };

  it('shows an animal listed elsewhere as for sale, with the listing behind it', () => {
    const draft = reconcileDraftWithListing({ id: '26-M-239' }, listing);
    expect(draft).toMatchObject({
      forSale: true,
      marketplacePublished: true,
      price: '1000',
      currency: 'GBP',
      saleDescription: 'From the Sell page.',
    });
  });

  it('never overwrites what the breeder has already put on the animal', () => {
    const draft = reconcileDraftWithListing(
      { id: '26-M-239', price: '450', currency: 'EUR', saleDescription: 'Mine.' }, listing,
    );
    expect(draft.price).toBe('450');
    expect(draft.currency).toBe('EUR');
    expect(draft.saleDescription).toBe('Mine.');
  });

  it('treats a blank field on the animal as a silence the listing may fill', () => {
    const draft = reconcileDraftWithListing({ id: 'x', price: '', saleDescription: '   ' }, listing);
    expect(draft.price).toBe('1000');
    expect(draft.saleDescription).toBe('From the Sell page.');
  });

  it('leaves an unlisted animal exactly as it was', () => {
    const draft = { id: '26-F-011', forSale: false };
    expect(reconcileDraftWithListing(draft, undefined)).toBe(draft);
    expect(reconcileDraftWithListing(draft, null)).toBe(draft);
  });
});
