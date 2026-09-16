import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma", () => ({
  prisma: {
    marketplaceWishlist: { findMany: vi.fn(), count: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
    marketplaceWishlistMatch: { create: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock("../services/notificationService", () => ({ createNotification: vi.fn() }));

import { prisma } from "../lib/prisma";
import { createNotification } from "../services/notificationService";
import { notifyWishlistMatches } from "../services/wishlistService";

const db = prisma as any;

const listing = {
  id: "listing-1",
  sellerUserId: "seller-1",
  status: "available",
  archivedAt: null,
  title: "Mojave Ultramel × Frank - 5",
  species: "Ball python",
  genetics: "Phantom, Het Ultramel, 50% Het Sunset",
  sex: "Male",
  price: 1000,
  currency: "EUR",
  country: "Netherlands",
};

const wanting = (extra: Record<string, unknown> = {}) => ({
  id: "w1", userId: "buyer-1", label: "Phantom project",
  includeGenes: ["phantom"], excludeGenes: [], isActive: true, ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.marketplaceWishlistMatch.create.mockResolvedValue({ id: "m1" });
  (createNotification as any).mockResolvedValue({ id: "n1" });
});

describe("telling buyers a wanted animal is up", () => {
  it("notifies the buyer whose wishlist the animal matches", async () => {
    db.marketplaceWishlist.findMany.mockResolvedValue([wanting()]);

    expect(await notifyWishlistMatches(listing)).toBe(1);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: "buyer-1",
        type: "wishlist_match",
        metadata: expect.objectContaining({ listingId: "listing-1" }),
      })
    );
  });

  it("never tells a seller about their own animal", async () => {
    db.marketplaceWishlist.findMany.mockResolvedValue([]);
    await notifyWishlistMatches(listing);

    expect(db.marketplaceWishlist.findMany.mock.calls[0][0].where).toMatchObject({
      isActive: true,
      userId: { not: "seller-1" },
    });
  });

  /**
   * The quiet guarantee. A seller editing a price re-publishes the listing, and
   * without the unique pair every edit would notify the same buyer again.
   */
  it("says nothing the second time the same listing is published", async () => {
    db.marketplaceWishlist.findMany.mockResolvedValue([wanting()]);
    db.marketplaceWishlistMatch.create.mockRejectedValue(new Error("unique constraint"));

    expect(await notifyWishlistMatches(listing)).toBe(0);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("stays silent for a draft, an archived listing, or one that does not match", async () => {
    db.marketplaceWishlist.findMany.mockResolvedValue([wanting()]);

    expect(await notifyWishlistMatches({ ...listing, status: "draft" })).toBe(0);
    expect(await notifyWishlistMatches({ ...listing, archivedAt: new Date() })).toBe(0);
    expect(await notifyWishlistMatches({ ...listing, genetics: "Pastel, Clown" })).toBe(0);
    expect(createNotification).not.toHaveBeenCalled();
  });

  /** A listing must never fail to save because a wishlist could not be told about it. */
  it("swallows a failure rather than taking the publish down with it", async () => {
    db.marketplaceWishlist.findMany.mockRejectedValue(new Error("database is on fire"));
    await expect(notifyWishlistMatches(listing)).resolves.toBe(0);
  });

  it("notifies several buyers waiting on the same animal", async () => {
    db.marketplaceWishlist.findMany.mockResolvedValue([
      wanting(),
      wanting({ id: "w2", userId: "buyer-2", label: "Ultramel" , includeGenes: ["het ultramel"] }),
      wanting({ id: "w3", userId: "buyer-3", includeGenes: ["clown"] }),
    ]);

    expect(await notifyWishlistMatches(listing)).toBe(2);
  });
});
