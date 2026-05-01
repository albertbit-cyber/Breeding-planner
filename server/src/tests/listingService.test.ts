import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = {
  listing: {
    deleteMany: vi.fn(),
    create: vi.fn(),
  },
};

vi.mock("../lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (callback) => callback(tx)),
    user: { findUnique: vi.fn() },
    listing: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "../lib/prisma";
import {
  listModerationListings,
  listPublicMarketplaceListings,
  replaceMyListings,
  updateListingModerationStatus,
} from "../services/listingService";

beforeEach(() => {
  vi.clearAllMocks();
  tx.listing.deleteMany.mockResolvedValue({ count: 0 });
  tx.listing.create.mockResolvedValue({});
  vi.mocked((prisma as any).user.findUnique).mockResolvedValue({ id: "breeder-1", role: "breeder" });
  vi.mocked((prisma as any).listing.findMany).mockResolvedValue([]);
  vi.mocked((prisma as any).listing.findFirst).mockResolvedValue({
    id: "listing-row-1",
    ownerId: "breeder-1",
    appListingId: "listing-1",
    animalAppId: "snake-1",
    title: "Banana Clown",
    status: "available",
    priceCents: 25000,
    currency: "EUR",
    payload: { id: "listing-1", title: "Banana Clown", status: "available" },
    updatedAt: new Date("2026-05-01T10:00:00.000Z"),
  });
  vi.mocked((prisma as any).listing.update).mockResolvedValue({
    id: "listing-row-1",
    ownerId: "breeder-1",
    appListingId: "listing-1",
    animalAppId: "snake-1",
    title: "Banana Clown",
    status: "hidden",
    priceCents: 25000,
    currency: "EUR",
    payload: { id: "listing-1", title: "Banana Clown", status: "hidden" },
    updatedAt: new Date("2026-05-01T11:00:00.000Z"),
    owner: {
      id: "breeder-1",
      fullName: "Demo User",
      email: "breeder@example.com",
      role: "breeder",
      profile: { breederName: "Demo Breeder", isPublic: true },
    },
  });
});

describe("listingService", () => {
  it("replaces breeder listings with normalized public inventory rows", async () => {
    await replaceMyListings("breeder-1", {
      listings: [{
        id: "listing-1",
        animalAppId: "snake-1",
        title: " Banana   Clown ",
        status: "available",
        price: "250.25",
        currency: "EUR",
      }],
    });

    expect(tx.listing.deleteMany).toHaveBeenCalledWith({ where: { ownerId: "breeder-1" } });
    expect(tx.listing.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        ownerId: "breeder-1",
        appListingId: "listing-1",
        animalAppId: "snake-1",
        title: "Banana Clown",
        status: "available",
        priceCents: 25025,
        currency: "EUR",
      }),
    }));
  });

  it("rejects buyer users managing listings", async () => {
    vi.mocked((prisma as any).user.findUnique).mockResolvedValue({ id: "buyer-1", role: "buyer" });

    await expect(replaceMyListings("buyer-1", { listings: [] }))
      .rejects.toThrow("Only breeder or admin users can manage listings.");
  });

  it("lists marketplace listings with breeder summary", async () => {
    vi.mocked((prisma as any).listing.findMany).mockResolvedValue([
      {
        id: "listing-row-1",
        ownerId: "breeder-1",
        appListingId: "listing-1",
        animalAppId: "snake-1",
        title: "Banana Clown",
        status: "available",
        priceCents: 25000,
        currency: "EUR",
        payload: { id: "listing-1", title: "Banana Clown" },
        updatedAt: new Date("2026-05-01T10:00:00.000Z"),
        owner: {
          id: "breeder-1",
          fullName: "Demo User",
          email: "breeder@example.com",
          profile: {
            breederName: "Demo Breeder",
            location: "Berlin",
            publicContactEmail: "public@example.com",
            publicContactPhone: null,
            contactPreference: "email",
          },
        },
      },
    ]);

    await expect(listPublicMarketplaceListings()).resolves.toEqual([
      expect.objectContaining({
        id: "listing-1",
        breeder: expect.objectContaining({
          breederName: "Demo Breeder",
          location: "Berlin",
        }),
      }),
    ]);
  });

  it("lists all marketplace listings for admin moderation", async () => {
    vi.mocked((prisma as any).listing.findMany).mockResolvedValue([
      {
        id: "listing-row-1",
        ownerId: "breeder-1",
        appListingId: "listing-1",
        animalAppId: "snake-1",
        title: "Banana Clown",
        status: "draft",
        priceCents: 25000,
        currency: "EUR",
        payload: { id: "listing-1", title: "Banana Clown", status: "draft" },
        updatedAt: new Date("2026-05-01T10:00:00.000Z"),
        owner: {
          id: "breeder-1",
          fullName: "Demo User",
          email: "breeder@example.com",
          role: "breeder",
          profile: { breederName: "Demo Breeder", isPublic: true },
        },
      },
    ]);

    await expect(listModerationListings({ role: "admin" })).resolves.toEqual([
      expect.objectContaining({
        id: "listing-1",
        status: "draft",
        breeder: expect.objectContaining({ breederName: "Demo Breeder" }),
      }),
    ]);
  });

  it("lets admins change listing moderation status", async () => {
    await expect(updateListingModerationStatus(
      { role: "admin" },
      "listing-1",
      "hidden"
    )).resolves.toMatchObject({
      id: "listing-1",
      status: "hidden",
    });

    expect((prisma as any).listing.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "listing-row-1" },
      data: expect.objectContaining({
        status: "hidden",
        payload: expect.objectContaining({ status: "hidden" }),
      }),
    }));
  });

  it("rejects non-admin moderation actions", async () => {
    await expect(listModerationListings({ role: "breeder" }))
      .rejects.toThrow("Only admin users can moderate marketplace listings.");
    await expect(updateListingModerationStatus({ role: "breeder" }, "listing-1", "hidden"))
      .rejects.toThrow("Only admin users can moderate marketplace listings.");
  });
});
