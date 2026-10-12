import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma", () => ({
  prisma: {
    marketplaceListing: { findFirst: vi.fn() },
    listingInquiry: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    notification: { create: vi.fn() },
  },
}));

import { prisma } from "../lib/prisma";
import { createListingInquiry, listMyInquiries, updateInquiryFollowUp } from "../services/inquiryService";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked((prisma as any).marketplaceListing.findFirst).mockResolvedValue({
    id: "listing-1",
    sellerUserId: "breeder-1",
    title: "Banana Clown",
  });
  vi.mocked((prisma as any).listingInquiry.create).mockResolvedValue({
    id: "inquiry-1",
    listingId: null,
    marketplaceListingId: "listing-1",
    breederId: "breeder-1",
    buyerId: "buyer-1",
    buyerName: "Buyer User",
    buyerEmail: "buyer@example.com",
    message: "Is this animal still available?",
    status: "new",
    createdAt: new Date("2026-05-01T10:00:00.000Z"),
    marketplaceListing: { id: "listing-1", title: "Banana Clown" },
    listing: null,
  });
  vi.mocked((prisma as any).listingInquiry.findMany).mockResolvedValue([]);
  vi.mocked((prisma as any).listingInquiry.findUnique).mockResolvedValue({
    id: "inquiry-1",
    listingId: "listing-row-1",
    breederId: "breeder-1",
    buyerId: "buyer-1",
    buyerName: "Buyer User",
    buyerEmail: "buyer@example.com",
    message: "Is this animal still available?",
    status: "new",
    breederResponseNote: null,
    respondedAt: null,
    createdAt: new Date("2026-05-01T10:00:00.000Z"),
    listing: { appListingId: "listing-1", title: "Banana Clown" },
  });
  vi.mocked((prisma as any).listingInquiry.update).mockResolvedValue({
    id: "inquiry-1",
    listingId: "listing-row-1",
    breederId: "breeder-1",
    buyerId: "buyer-1",
    buyerName: "Buyer User",
    buyerEmail: "buyer@example.com",
    message: "Is this animal still available?",
    status: "contacted",
    breederResponseNote: "Email sent.",
    respondedAt: new Date("2026-05-01T11:00:00.000Z"),
    createdAt: new Date("2026-05-01T10:00:00.000Z"),
    listing: { appListingId: "listing-1", title: "Banana Clown" },
  });
  vi.mocked((prisma as any).notification.create).mockResolvedValue({
    id: "notification-1",
    type: "listing_inquiry",
    title: "New listing inquiry",
    message: "Buyer asked about Banana Clown.",
    metadata: {},
    readAt: null,
    createdAt: new Date("2026-05-01T10:00:00.000Z"),
    actor: null,
  });
});

describe("inquiryService", () => {
  it("creates an inquiry for an available public listing", async () => {
    await expect(createListingInquiry(
      { id: "buyer-1", role: "buyer" },
      {
        listingId: "listing-1",
        buyerName: "Buyer User",
        buyerEmail: "BUYER@example.com",
        message: "Is this animal still available?",
      }
    )).resolves.toMatchObject({
      id: "inquiry-1",
      listingId: "listing-1",
      buyerEmail: "buyer@example.com",
    });

    expect((prisma as any).listingInquiry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        marketplaceListingId: "listing-1",
        breederId: "breeder-1",
        buyerId: "buyer-1",
        buyerEmail: "buyer@example.com",
      }),
    }));
    expect((prisma as any).notification.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        recipientId: "breeder-1",
        actorId: "buyer-1",
        type: "listing_inquiry",
      }),
    }));
  });

  it("looks the listing up in the one listing store, under the catalogue rule", async () => {
    await createListingInquiry(
      { id: "buyer-1", role: "buyer" },
      { listingId: "legacy-row-7", buyerName: "Buyer User", buyerEmail: "buyer@example.com", message: "Is this animal still available?" }
    );

    expect((prisma as any).marketplaceListing.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        // A link from before the copy carries the legacy id; it still resolves.
        OR: [{ id: "legacy-row-7" }, { legacyListingId: "legacy-row-7" }],
        archivedAt: null,
        status: { in: ["available", "reserved"] },
        seller: { isActive: true },
      }),
    });
  });

  it("refuses a listing that is not in the catalogue", async () => {
    vi.mocked((prisma as any).marketplaceListing.findFirst).mockResolvedValue(null);
    await expect(createListingInquiry(
      { id: "buyer-1", role: "buyer" },
      { listingId: "hidden-1", buyerName: "Buyer User", buyerEmail: "buyer@example.com", message: "Is this animal still available?" }
    )).rejects.toMatchObject({ statusCode: 404 });
    expect((prisma as any).listingInquiry.create).not.toHaveBeenCalled();
  });

  it("still reads an inquiry made against the retired listings table", async () => {
    vi.mocked((prisma as any).listingInquiry.findMany).mockResolvedValue([
      {
        id: "inquiry-old",
        listingId: "legacy-row-1",
        marketplaceListingId: null,
        breederId: "breeder-1",
        status: "closed",
        listing: { appListingId: "listing-old", title: "Old Pied" },
        marketplaceListing: null,
      },
    ]);
    await expect(listMyInquiries({ id: "breeder-1", role: "breeder" })).resolves.toEqual([
      expect.objectContaining({ listingId: "listing-old", listingTitle: "Old Pied" }),
    ]);
  });

  it("blocks inquiries on the actor's own listing", async () => {
    await expect(createListingInquiry(
      { id: "breeder-1", role: "breeder" },
      {
        listingId: "listing-1",
        buyerName: "Breeder User",
        buyerEmail: "breeder@example.com",
        message: "I want to ask about my own listing.",
      }
    )).rejects.toThrow("You cannot inquire about your own listing.");
  });

  it("lists breeder inquiries by breeder id", async () => {
    vi.mocked((prisma as any).listingInquiry.findMany).mockResolvedValue([
      {
        id: "inquiry-1",
        listingId: "listing-row-1",
        breederId: "breeder-1",
        buyerId: "buyer-1",
        buyerName: "Buyer User",
        buyerEmail: "buyer@example.com",
        message: "Is this animal still available?",
        status: "new",
        createdAt: new Date("2026-05-01T10:00:00.000Z"),
        listing: { appListingId: "listing-1", title: "Banana Clown" },
      },
    ]);

    await expect(listMyInquiries({ id: "breeder-1", role: "breeder" })).resolves.toEqual([
      expect.objectContaining({
        id: "inquiry-1",
        listingTitle: "Banana Clown",
      }),
    ]);

    expect((prisma as any).listingInquiry.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { breederId: "breeder-1" },
    }));
  });

  it("lets the receiving breeder update inquiry status and response note", async () => {
    await expect(updateInquiryFollowUp(
      { id: "breeder-1", role: "breeder" },
      "inquiry-1",
      { status: "contacted", breederResponseNote: "Email sent." }
    )).resolves.toMatchObject({
      id: "inquiry-1",
      status: "contacted",
      breederResponseNote: "Email sent.",
    });

    expect((prisma as any).listingInquiry.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "inquiry-1" },
      data: expect.objectContaining({
        status: "contacted",
        breederResponseNote: "Email sent.",
      }),
    }));
    expect((prisma as any).notification.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        recipientId: "buyer-1",
        actorId: "breeder-1",
        type: "inquiry_follow_up",
      }),
    }));
  });

  it("blocks buyers from updating breeder follow-up fields", async () => {
    await expect(updateInquiryFollowUp(
      { id: "buyer-1", role: "buyer" },
      "inquiry-1",
      { status: "closed" }
    )).rejects.toThrow("Only the receiving breeder or admin can update this inquiry.");
  });
});
