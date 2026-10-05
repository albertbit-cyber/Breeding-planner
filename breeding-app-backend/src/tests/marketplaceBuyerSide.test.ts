import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma", () => {
  const db: any = {
    marketplaceListing: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn(), findMany: vi.fn() },
    marketplaceConversation: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    marketplaceMessage: { create: vi.fn() },
    marketplaceUserBlock: { findMany: vi.fn() },
    marketplaceSale: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    marketplaceReview: { findFirst: vi.fn(), create: vi.fn(), aggregate: vi.fn() },
    marketplaceStore: { updateMany: vi.fn() },
    marketplaceFavorite: { findUnique: vi.fn(), create: vi.fn(), delete: vi.fn() },
    savedSearch: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  };
  db.$transaction = vi.fn(async (fn: any) => fn(db));
  return { prisma: db };
});

vi.mock("../services/subscriptionService", () => ({
  canAccessFeature: vi.fn().mockResolvedValue({ allowed: true }),
}));
vi.mock("../services/notificationService", () => ({ createNotification: vi.fn() }));
// The record transfer has its own end-to-end test (marketplaceSaleService.test.ts).
vi.mock("../services/marketplaceSaleService", () => ({
  markSold: vi.fn(async (_actor: any, input: any) => ({
    sale: { id: "sale-1", listingId: input.listingId, saleStatus: "completed" },
    animal: { appAnimalId: "25Ath-1" },
    alreadyTransferred: false,
  })),
}));

import { prisma } from "../lib/prisma";
import { createNotification } from "../services/notificationService";
import { markSold } from "../services/marketplaceSaleService";
import {
  addMarketplaceMessage,
  completeMarketplaceSale,
  createMarketplaceConversation,
  createMarketplaceReview,
  getMarketplaceConversation,
  toggleMarketplaceFavorite,
} from "../services/marketplaceService";
import { listMySavedSearches, markMarketplaceSearchRun } from "../services/savedSearchService";

const db = prisma as any;
const buyer = { id: "buyer-1", role: "buyer" } as any;
const seller = { id: "seller-1", role: "breeder" } as any;

const listing = {
  id: "listing-1",
  title: "Clown het Pied",
  sellerUserId: "seller-1",
  status: "available",
  archivedAt: null,
  currency: "EUR",
};

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (fn: any) => fn(db));
  db.marketplaceUserBlock.findMany.mockResolvedValue([]);
  db.marketplaceSale.findMany.mockResolvedValue([]);
  db.marketplaceListing.findUnique.mockResolvedValue(listing);
});

describe("blocks are enforced, not just recorded", () => {
  it("stops a buyer the seller has blocked from opening a thread", async () => {
    db.marketplaceUserBlock.findMany.mockResolvedValue([{ blockerUserId: "seller-1" }]);
    await expect(
      createMarketplaceConversation(buyer, { listingId: "listing-1", messageText: "Still available?" })
    ).rejects.toMatchObject({ statusCode: 403, message: "This user is not accepting messages from you." });
    expect(db.marketplaceConversation.create).not.toHaveBeenCalled();
  });

  it("stops the blocker from messaging someone they blocked", async () => {
    db.marketplaceConversation.findUnique.mockResolvedValue({
      id: "c1",
      listingId: "listing-1",
      buyerUserId: "buyer-1",
      sellerUserId: "seller-1",
      status: "open",
    });
    db.marketplaceUserBlock.findMany.mockResolvedValue([{ blockerUserId: "buyer-1" }]);
    await expect(addMarketplaceMessage(buyer, "c1", { messageText: "hello" })).rejects.toMatchObject({
      statusCode: 403,
      message: "You blocked this user. Unblock them to send a message.",
    });
    expect(db.marketplaceMessage.create).not.toHaveBeenCalled();
  });

  it("tells the thread who blocked whom, from the viewer's side", async () => {
    db.marketplaceConversation.findUnique.mockResolvedValue({
      id: "c1",
      listingId: "listing-1",
      buyerUserId: "buyer-1",
      sellerUserId: "seller-1",
      status: "open",
      messages: [],
      listing: { id: "listing-1", title: "Clown", images: [] },
      buyer: { id: "buyer-1", fullName: "Buyer" },
      seller: { id: "seller-1", fullName: "Seller" },
    });
    db.marketplaceUserBlock.findMany.mockResolvedValue([{ blockerUserId: "buyer-1", blockedUserId: "seller-1" }]);
    const { conversation } = await getMarketplaceConversation(buyer, "c1");
    expect(conversation?.blocked).toBe("by_me");
  });

  it("does not let anyone open a thread on a draft listing", async () => {
    db.marketplaceListing.findUnique.mockResolvedValue({ ...listing, status: "draft" });
    await expect(
      createMarketplaceConversation(buyer, { listingId: "listing-1", messageText: "hi" })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("reviews belong to a completed sale and its buyer", () => {
  const completedSale = { id: "sale-1", sellerUserId: "seller-1", buyerUserId: "buyer-1", saleStatus: "completed" };

  beforeEach(() => {
    db.marketplaceSale.findUnique.mockResolvedValue(completedSale);
    db.marketplaceReview.findFirst.mockResolvedValue(null);
    db.marketplaceReview.create.mockImplementation(async ({ data }: any) => ({ id: "review-1", ...data }));
    db.marketplaceReview.aggregate.mockResolvedValue({ _avg: { rating: 4 }, _count: { id: 1 } });
  });

  it("publishes the buyer's review and refreshes the store's rating", async () => {
    const result = await createMarketplaceReview(buyer, { saleId: "sale-1", rating: 4, reviewText: "Great feeder" });
    expect(result.review).toMatchObject({ rating: 4, reviewText: "Great feeder" });
    expect(db.marketplaceStore.updateMany).toHaveBeenCalledWith({
      where: { userId: "seller-1" },
      data: { ratingAverage: 4, reviewCount: 1 },
    });
  });

  it("refuses anyone who was not the buyer", async () => {
    await expect(
      createMarketplaceReview({ id: "stranger", role: "buyer" } as any, { saleId: "sale-1", rating: 1 })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("refuses a sale that is only reserved", async () => {
    db.marketplaceSale.findUnique.mockResolvedValue({ ...completedSale, saleStatus: "reserved" });
    await expect(createMarketplaceReview(buyer, { saleId: "sale-1", rating: 5 })).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("allows one review per sale", async () => {
    db.marketplaceReview.findFirst.mockResolvedValue({ id: "review-0" });
    await expect(createMarketplaceReview(buyer, { saleId: "sale-1", rating: 5 })).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("requires a rating rather than defaulting to five stars", async () => {
    await expect(createMarketplaceReview(buyer, { saleId: "sale-1" })).rejects.toMatchObject({ statusCode: 400 });
    await createMarketplaceReview(buyer, { saleId: "sale-1", rating: 9 });
    expect(db.marketplaceReview.create).toHaveBeenCalledWith({ data: expect.objectContaining({ rating: 5 }) });
  });
});

describe("completing a sale", () => {
  const reserved = {
    id: "sale-1",
    listingId: "listing-1",
    sellerUserId: "seller-1",
    buyerUserId: "buyer-1",
    saleStatus: "reserved",
    paymentStatus: "deposit_paid",
    listing,
  };

  it("hands a marketplace buyer the animal's record through markSold", async () => {
    db.marketplaceSale.findUnique.mockResolvedValue({ ...reserved, salePrice: 400 });
    const result = await completeMarketplaceSale(seller, "sale-1", { handoverMethod: "Pickup at Hamm" });
    expect(markSold).toHaveBeenCalledWith(seller, {
      listingId: "listing-1",
      buyerUserId: "buyer-1",
      price: 400,
      handoverMethod: "Pickup at Hamm",
    });
    expect(result).toMatchObject({ sale: { saleStatus: "completed" }, animal: { appAnimalId: "25Ath-1" } });
  });

  it("closes an off-platform sale (a buyer known only by name) without a transfer", async () => {
    const offPlatform = { ...reserved, buyerUserId: null, buyerName: "Fair visitor" };
    db.marketplaceSale.findUnique.mockResolvedValue(offPlatform);
    db.marketplaceSale.update.mockImplementation(async ({ data }: any) => ({ ...offPlatform, ...data }));

    const result = await completeMarketplaceSale(seller, "sale-1", {});

    expect(markSold).not.toHaveBeenCalled();

    expect(result.sale).toMatchObject({ saleStatus: "completed", paymentStatus: "paid" });
    expect(db.marketplaceListing.update).toHaveBeenCalledWith({
      where: { id: "listing-1" },
      data: { availability: "sold", status: "sold" },
    });
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("is the seller's action, not the buyer's", async () => {
    db.marketplaceSale.findUnique.mockResolvedValue(reserved);
    await expect(completeMarketplaceSale(buyer, "sale-1", {})).rejects.toMatchObject({ statusCode: 403 });
    expect(db.marketplaceSale.update).not.toHaveBeenCalled();
    expect(markSold).not.toHaveBeenCalled();
  });
});

describe("favourites", () => {
  it("answers 404 for a listing that does not exist instead of failing on the foreign key", async () => {
    db.marketplaceFavorite.findUnique.mockResolvedValue(null);
    db.marketplaceListing.findUnique.mockResolvedValue(null);
    await expect(toggleMarketplaceFavorite(buyer, "missing")).rejects.toMatchObject({ statusCode: 404 });
    expect(db.marketplaceFavorite.create).not.toHaveBeenCalled();
  });

  it("saves and unsaves", async () => {
    db.marketplaceListing.update.mockResolvedValue(listing);
    db.marketplaceFavorite.findUnique.mockResolvedValueOnce(null);
    await expect(toggleMarketplaceFavorite(buyer, "listing-1")).resolves.toEqual({ favorited: true });
    db.marketplaceFavorite.findUnique.mockResolvedValueOnce({ id: "fav-1" });
    await expect(toggleMarketplaceFavorite(buyer, "listing-1")).resolves.toEqual({ favorited: false });
  });
});

describe("saved searches report what is new instead of promising an email", () => {
  it("counts all matches and those listed since the search was last run", async () => {
    const lastRun = new Date("2026-10-01T00:00:00.000Z");
    db.savedSearch.findMany.mockResolvedValue([
      { id: "s1", name: "Female clowns", filters: { includeGenes: "Clown", sex: "female" }, updatedAt: lastRun },
    ]);
    db.marketplaceListing.findMany.mockResolvedValue([{ id: "l1", genetics: "Clown" }]);
    db.marketplaceListing.count.mockResolvedValueOnce(5).mockResolvedValueOnce(2);

    const [search] = await listMySavedSearches(buyer);

    expect(search).toMatchObject({ id: "s1", matchCount: 5, newSinceLastRun: 2 });
    const sinceWhere = db.marketplaceListing.count.mock.calls[1][0].where;
    expect(sinceWhere.publishedAt).toEqual({ gt: lastRun });
    expect(sinceWhere.sex).toBe("female");
  });

  it("still lists a search when its count fails", async () => {
    db.savedSearch.findMany.mockResolvedValue([{ id: "s1", name: "x", filters: {}, updatedAt: new Date() }]);
    db.marketplaceListing.count.mockRejectedValue(new Error("db down"));
    const [search] = await listMySavedSearches(buyer);
    expect(search).toMatchObject({ id: "s1", matchCount: null, newSinceLastRun: null });
  });

  it("marks a search as run, only for its owner", async () => {
    db.savedSearch.findUnique.mockResolvedValue({ id: "s1", ownerId: "buyer-1" });
    db.savedSearch.update.mockResolvedValue({ id: "s1", name: "x", filters: {}, updatedAt: new Date() });
    await markMarketplaceSearchRun(buyer, "s1");
    expect(db.savedSearch.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: { updatedAt: expect.any(Date) } });

    await expect(markMarketplaceSearchRun({ id: "other", role: "buyer" } as any, "s1")).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});
