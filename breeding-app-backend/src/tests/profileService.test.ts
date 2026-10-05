import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    profile: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    marketplaceListing: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "../lib/prisma";
import { listPublicBreederProfiles, upsertMyProfile } from "../services/profileService";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked((prisma as any).marketplaceListing.findMany).mockResolvedValue([]);
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
    vi.mocked((prisma as any).marketplaceListing.findMany).mockResolvedValue([
      {
        id: "listing-1",
        sellerUserId: "breeder-1",
        animalId: "snake-1",
        title: "Banana Clown",
        status: "available",
        price: 250,
        currency: "EUR",
        description: "private-ish seller notes are not part of the profile shape",
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
    // The profile reads the one listing store, under the catalogue's own rule.
    expect((prisma as any).marketplaceListing.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        sellerUserId: "breeder-1",
        archivedAt: null,
        status: { in: ["available", "reserved"] },
      }),
    }));
    const [profile] = await listPublicBreederProfiles();
    expect(JSON.stringify(profile.listings)).not.toContain("seller notes");
  });
});
