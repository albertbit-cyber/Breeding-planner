import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    profile: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    listing: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "../lib/prisma";
import { listPublicBreederProfiles, upsertMyProfile } from "../services/profileService";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked((prisma as any).listing.findMany).mockResolvedValue([]);
});

describe("profileService", () => {
  it("upserts a breeder public profile with sanitized public fields", async () => {
    vi.mocked((prisma as any).user.findUnique).mockResolvedValue({ id: "breeder-1", role: "breeder" });
    vi.mocked((prisma as any).profile.upsert).mockResolvedValue({
      id: "profile-1",
      userId: "breeder-1",
      breederName: "Demo Breeder",
      bio: "Public bio",
      isPublic: true,
      updatedAt: new Date("2026-05-01T10:00:00.000Z"),
      user: { id: "breeder-1", fullName: "Demo User", email: "breeder@example.com" },
    });

    await expect(upsertMyProfile("breeder-1", {
      breederName: " Demo   Breeder ",
      bio: " Public   bio ",
      isPublic: true,
    })).resolves.toMatchObject({
      id: "profile-1",
      breederName: "Demo Breeder",
      isPublic: true,
    });

    expect((prisma as any).profile.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "breeder-1" },
      create: expect.objectContaining({
        userId: "breeder-1",
        breederName: "Demo Breeder",
        bio: "Public bio",
        isPublic: true,
      }),
    }));
  });

  it("rejects buyer users publishing breeder profiles", async () => {
    vi.mocked((prisma as any).user.findUnique).mockResolvedValue({ id: "buyer-1", role: "buyer" });

    await expect(upsertMyProfile("buyer-1", { breederName: "Buyer" }))
      .rejects.toThrow("Only breeder or admin users can publish breeder profiles.");
  });

  it("lists public breeder marketplace profiles only", async () => {
    vi.mocked((prisma as any).profile.findMany).mockResolvedValue([
      {
        id: "profile-1",
        userId: "breeder-1",
        breederName: "Demo Breeder",
        location: "Berlin",
        isPublic: true,
        updatedAt: new Date("2026-05-01T10:00:00.000Z"),
        user: { id: "breeder-1", fullName: "Demo User", email: "breeder@example.com" },
      },
    ]);
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
      },
    ]);

    await expect(listPublicBreederProfiles()).resolves.toEqual([
      expect.objectContaining({
        id: "profile-1",
        breederName: "Demo Breeder",
        location: "Berlin",
        listings: [
          expect.objectContaining({
            id: "listing-1",
            title: "Banana Clown",
          }),
        ],
      }),
    ]);

    expect((prisma as any).profile.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ isPublic: true }),
    }));
  });
});
