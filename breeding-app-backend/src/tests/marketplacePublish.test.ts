import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma", () => ({
  prisma: {
    marketplaceListing: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    marketplaceListingImage: { deleteMany: vi.fn(), createMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("../services/subscriptionService", () => ({ canAccessFeature: vi.fn() }));
vi.mock("../services/notificationService", () => ({ createNotification: vi.fn() }));

import { prisma } from "../lib/prisma";
import { canAccessFeature } from "../services/subscriptionService";
import { createMarketplaceListing } from "../services/marketplaceService";

const db = prisma as any;
const seller = { id: "seller-1", role: "breeder" } as any;

/**
 * What the breeder app sends when a snake is saved with For Sale switched on.
 * The four fields the seller actually filled in are the point of the test.
 */
const publishPayload = {
  animalId: "26-M-004",
  title: "Kingsley",
  species: "Ball python",
  genetics: "Clown, het Pied",
  sex: "Male",
  price: 450,
  currency: "GBP",
  description: "Feeding on frozen-thawed rats, never refused.",
  status: "available",
};

beforeEach(() => {
  vi.clearAllMocks();
  (canAccessFeature as any).mockResolvedValue({ allowed: true });
  db.$transaction.mockImplementation(async (fn: any) => fn(db));
  db.marketplaceListing.findFirst.mockResolvedValue(null);
  db.marketplaceListing.create.mockResolvedValue({ id: "listing-1" });
  db.marketplaceListing.update.mockResolvedValue({ id: "listing-1" });
  db.marketplaceListing.findUnique.mockResolvedValue({ id: "listing-1", sellerUserId: "seller-1", ...publishPayload, seller: null, images: [] });
});

describe("publishing a for-sale animal", () => {
  it("stores the genetics, price, currency and description the breeder typed", async () => {
    await createMarketplaceListing(seller, publishPayload);

    const data = db.marketplaceListing.create.mock.calls[0][0].data;
    expect(data.genetics).toBe("Clown, het Pied");
    expect(data.price).toBe(450);
    expect(data.currency).toBe("GBP");
    expect(data.description).toBe("Feeding on frozen-thawed rats, never refused.");
  });

  /**
   * Browse only returns rows whose status is available or reserved, so a
   * listing created as a draft is published and invisible at the same time.
   */
  it("publishes as available rather than as a draft, and stamps publishedAt", async () => {
    await createMarketplaceListing(seller, publishPayload);

    const data = db.marketplaceListing.create.mock.calls[0][0].data;
    expect(data.status).toBe("available");
    expect(data.availability).toBe("available");
    expect(data.publishedAt).toBeInstanceOf(Date);
  });

  it("updates the existing card when the same animal is published again", async () => {
    db.marketplaceListing.findFirst.mockResolvedValue({ id: "listing-1" });

    await createMarketplaceListing(seller, { ...publishPayload, price: 400, description: "Price reduced." });

    expect(db.marketplaceListing.create).not.toHaveBeenCalled();
    const update = db.marketplaceListing.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: "listing-1" });
    expect(update.data.price).toBe(400);
    expect(update.data.description).toBe("Price reduced.");
  });

  it("looks for the existing card by seller and animal, ignoring archived ones", async () => {
    await createMarketplaceListing(seller, publishPayload);

    expect(db.marketplaceListing.findFirst.mock.calls[0][0].where).toEqual({
      sellerUserId: "seller-1",
      animalId: "26-M-004",
      archivedAt: null,
    });
  });

  it("still creates a listing when the animal is not linked to a record", async () => {
    await createMarketplaceListing(seller, { ...publishPayload, animalId: undefined });

    expect(db.marketplaceListing.findFirst).not.toHaveBeenCalled();
    expect(db.marketplaceListing.create).toHaveBeenCalled();
  });

  /** Taking a snake off sale hides the card without destroying its messages. */
  it("takes a published animal back off the marketplace as a draft", async () => {
    db.marketplaceListing.findFirst.mockResolvedValue({ id: "listing-1" });
    db.marketplaceListing.findUnique.mockResolvedValue({ id: "listing-1", sellerUserId: "seller-1", publishedAt: new Date(), seller: null, images: [] });

    await createMarketplaceListing(seller, { ...publishPayload, status: "draft" });

    expect(db.marketplaceListing.update.mock.calls[0][0].data.status).toBe("draft");
  });
});
