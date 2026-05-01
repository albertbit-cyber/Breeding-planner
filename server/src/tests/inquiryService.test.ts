import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma", () => ({
  prisma: {
    listing: { findFirst: vi.fn() },
    listingInquiry: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "../lib/prisma";
import { createListingInquiry, listMyInquiries } from "../services/inquiryService";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked((prisma as any).listing.findFirst).mockResolvedValue({
    id: "listing-row-1",
    ownerId: "breeder-1",
    appListingId: "listing-1",
    title: "Banana Clown",
  });
  vi.mocked((prisma as any).listingInquiry.create).mockResolvedValue({
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
  });
  vi.mocked((prisma as any).listingInquiry.findMany).mockResolvedValue([]);
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
        listingId: "listing-row-1",
        breederId: "breeder-1",
        buyerId: "buyer-1",
        buyerEmail: "buyer@example.com",
      }),
    }));
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
});
