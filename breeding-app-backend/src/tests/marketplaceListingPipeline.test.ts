import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../lib/prisma", () => ({
  prisma: {
    marketplaceListing: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    marketplaceListingImage: { deleteMany: vi.fn(), createMany: vi.fn() },
    marketplaceMedia: { findUnique: vi.fn(), updateMany: vi.fn() },
    marketplaceFavorite: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("../services/subscriptionService", () => ({ canAccessFeature: vi.fn() }));
vi.mock("../services/notificationService", () => ({ createNotification: vi.fn() }));
vi.mock("../services/marketplaceRecordService", () => ({
  buildListingRecord: vi.fn().mockResolvedValue(null),
  buildListingRecords: vi.fn().mockResolvedValue(new Map()),
  findUnpublishedEvidence: vi.fn().mockResolvedValue([]),
}));
vi.mock("../services/uploadStorageService", () => ({
  uploadStorage: { getObject: vi.fn().mockResolvedValue(Buffer.from("jpeg-bytes")) },
}));

import { prisma } from "../lib/prisma";
import { app } from "../app";
import { canAccessFeature } from "../services/subscriptionService";
import { createMarketplaceListing, getMarketplaceListing } from "../services/marketplaceService";
import { readMarketplaceMediaObject } from "../services/marketplaceRuntimeService";

const db = prisma as any;
const seller = { id: "seller-1", role: "breeder" } as any;
const stranger = { id: "buyer-9", role: "buyer" } as any;
const moderator = { id: "mod-1", role: "moderator" } as any;

beforeEach(() => {
  vi.clearAllMocks();
  (canAccessFeature as any).mockResolvedValue({ allowed: true });
  db.$transaction.mockImplementation(async (fn: any) => fn(db));
  db.marketplaceListing.findFirst.mockResolvedValue(null);
  db.marketplaceListing.create.mockResolvedValue({ id: "listing-1" });
  db.marketplaceListing.update.mockImplementation(async ({ where }: any) => ({ id: where.id, sellerUserId: "seller-1", status: "available", images: [] }));
  db.marketplaceMedia.updateMany.mockResolvedValue({ count: 1 });
});

describe("publishing in one pass", () => {
  it("creates the listing with status, currency and photo in a single request", async () => {
    db.marketplaceListing.findUnique.mockResolvedValue({ id: "listing-1", sellerUserId: "seller-1", status: "available", images: [] });

    await createMarketplaceListing(seller, {
      animalId: "26-M-004",
      title: "Kingsley",
      price: 450,
      currency: "GBP",
      status: "available",
      images: [{ imageUrl: "/api/marketplace/media/m-1", isPrimary: true, sortOrder: 0 }],
      mediaIds: ["m-1"],
    });

    expect(db.marketplaceListing.create).toHaveBeenCalledTimes(1);
    const { data } = db.marketplaceListing.create.mock.calls[0][0];
    expect(data).toMatchObject({ status: "available", currency: "GBP", price: 450 });
    expect(data.publishedAt).toBeInstanceOf(Date);
    expect(data.images.create).toEqual([expect.objectContaining({ imageUrl: "/api/marketplace/media/m-1", isPrimary: true })]);
    // The upload made before the listing existed is attached in the same transaction.
    expect(db.marketplaceMedia.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["m-1"] }, ownerUserId: "seller-1", listingId: null },
      data: { listingId: "listing-1" },
    });
  });

  it("attaches media on a re-publish of the same animal too", async () => {
    db.marketplaceListing.findFirst.mockResolvedValue({ id: "listing-7" });
    db.marketplaceListing.findUnique.mockResolvedValue({ id: "listing-7", sellerUserId: "seller-1", status: "available", publishedAt: new Date(), images: [] });

    await createMarketplaceListing(seller, { animalId: "26-M-004", status: "available", mediaIds: ["m-2"] });

    expect(db.marketplaceMedia.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: { in: ["m-2"] }, ownerUserId: "seller-1", listingId: null }),
      data: { listingId: "listing-7" },
    }));
  });

  it("only ever attaches the seller's own, unattached uploads", async () => {
    db.marketplaceListing.findUnique.mockResolvedValue({ id: "listing-1", sellerUserId: "seller-1", images: [] });
    await createMarketplaceListing(seller, { title: "No animal link", status: "available", mediaIds: ["someone-elses"] });

    const { where } = db.marketplaceMedia.updateMany.mock.calls[0][0];
    expect(where.ownerUserId).toBe("seller-1");
    expect(where.listingId).toBeNull();
  });
});

describe("what hides a listing", () => {
  const row = (status: string, archivedAt: Date | null = null) => ({ id: "listing-1", sellerUserId: "seller-1", status, archivedAt, images: [] });

  it.each(["draft", "hidden"])("a %s listing is not served to a stranger by id", async (status) => {
    db.marketplaceListing.findUnique.mockResolvedValue(row(status));
    await expect(getMarketplaceListing("listing-1", stranger)).rejects.toMatchObject({ statusCode: 404 });
    await expect(getMarketplaceListing("listing-1", null)).rejects.toMatchObject({ statusCode: 404 });
    expect(db.marketplaceListing.update).not.toHaveBeenCalled();
  });

  it("an archived listing is not served to a stranger, whatever its status", async () => {
    db.marketplaceListing.findUnique.mockResolvedValue(row("available", new Date()));
    await expect(getMarketplaceListing("listing-1", stranger)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("the seller and staff still open their own hidden listing", async () => {
    db.marketplaceListing.findUnique.mockResolvedValue(row("hidden"));
    await expect(getMarketplaceListing("listing-1", seller)).resolves.toHaveProperty("listing");
    await expect(getMarketplaceListing("listing-1", moderator)).resolves.toHaveProperty("listing");
  });

  it.each(["available", "reserved", "sold"])("a %s listing is public by link", async (status) => {
    db.marketplaceListing.findUnique.mockResolvedValue(row(status));
    await expect(getMarketplaceListing("listing-1", null)).resolves.toHaveProperty("listing");
  });

  it("a hidden listing's photos go offline with it", async () => {
    // Only "draft" used to be excluded here, so a moderator hiding a listing
    // left every one of its pictures public.
    db.marketplaceMedia.findUnique.mockResolvedValue({
      id: "m-1", ownerUserId: "seller-1", status: "ready", scanStatus: "clean", storageKey: "k", mimeType: "image/jpeg",
      listing: { status: "hidden", archivedAt: null },
    });
    await expect(readMarketplaceMediaObject("m-1", null)).rejects.toMatchObject({ statusCode: 404 });
    await expect(readMarketplaceMediaObject("m-1", seller)).resolves.toHaveProperty("buffer");
  });

  it("a sold listing keeps its photos, as a price comparison", async () => {
    db.marketplaceMedia.findUnique.mockResolvedValue({
      id: "m-1", ownerUserId: "seller-1", status: "ready", scanStatus: "clean", storageKey: "k", mimeType: "image/jpeg",
      listing: { status: "sold", archivedAt: null },
    });
    await expect(readMarketplaceMediaObject("m-1", null)).resolves.toHaveProperty("buffer");
  });
});

describe("the retired /api/listings API", () => {
  it.each([
    ["get", "/api/listings/me"],
    ["put", "/api/listings/me"],
    ["get", "/api/listings/marketplace"],
    ["get", "/api/listings/moderation"],
    ["patch", "/api/listings/listing-1/status"],
  ] as const)("%s %s answers 410 with a pointer", async (method, path) => {
    const res = await (request(app) as any)[method](path).send({});

    expect(res.status).toBe(410);
    expect(res.body).toMatchObject({
      replacement: "/api/marketplace/listings",
      removalDate: "2027-01-05",
    });
  });
});
