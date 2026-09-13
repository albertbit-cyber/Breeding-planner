import { describe, expect, it } from 'vitest';
import { buildMarketplaceListingPayload, parseListingPrice } from './listingPayload';

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
