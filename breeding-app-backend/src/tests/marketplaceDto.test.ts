import { describe, expect, it } from "vitest";
import {
  assertNoPrivateListingFields,
  toMarketplaceListingDto,
  toProfileListingDto,
  toMarketplaceStoreDto,
} from "../services/marketplaceDtos";

describe("marketplace DTO allowlists", () => {
  it("builds the profile listing shape from an allowlist, not from the row", () => {
    const dto = toProfileListingDto({
      id: "listing-1",
      sellerUserId: "breeder-1",
      animalId: "snake-1",
      title: "Banana Clown",
      status: "available",
      price: 250,
      currency: "EUR",
      updatedAt: new Date("2026-05-01T10:00:00.000Z"),
      description: "Seller notes",
      publicDataSettingsJson: { showBreederNotes: false },
      seller: { email: "private-owner@example.com", refreshToken: "secret" },
    });

    expect(dto).toMatchObject({
      id: "listing-1",
      animalAppId: "snake-1",
      title: "Banana Clown",
      price: 250,
      priceCents: 25000,
      currency: "EUR",
    });
    expect(JSON.stringify(dto)).not.toContain("private-owner@example.com");
    expect(JSON.stringify(dto)).not.toContain("refreshToken");
    expect(JSON.stringify(dto)).not.toContain("Seller notes");
    expect(assertNoPrivateListingFields(dto)).toBe(true);
  });

  it("filters marketplace listing seller and image fields through an allowlist", () => {
    const dto = toMarketplaceListingDto({
      id: "market-1",
      sellerUserId: "seller-1",
      animalId: "animal-1",
      title: "Pastel Clown",
      species: "Ball python",
      genetics: "Pastel Clown",
      price: 500,
      currency: "EUR",
      status: "available",
      availability: "available",
      images: [{ id: "image-1", imageUrl: "https://example.test/image.jpg", sortOrder: 0, isPrimary: true, storageKey: "private-key" }],
      seller: {
        id: "seller-1",
        fullName: "Seller Name",
        email: "seller-private@example.com",
        passwordHash: "hash",
        refreshToken: "secret",
        verificationStatus: "approved",
        profile: { breederName: "Public Seller", city: "Berlin", country: "DE" },
        marketplaceStores: [{ storeName: "Public Store", isVerified: true, ratingAverage: 5, reviewCount: 2 }],
      },
    });

    expect(dto).toMatchObject({
      id: "market-1",
      seller: expect.objectContaining({ name: "Public Store", isVerified: true }),
      images: [expect.objectContaining({ imageUrl: "https://example.test/image.jpg" })],
    });
    expect(JSON.stringify(dto)).not.toContain("seller-private@example.com");
    expect(JSON.stringify(dto)).not.toContain("passwordHash");
    expect(JSON.stringify(dto)).not.toContain("refreshToken");
    expect(JSON.stringify(dto)).not.toContain("storageKey");
    expect(assertNoPrivateListingFields(dto)).toBe(true);
  });

  it("filters store owner details", () => {
    const dto = toMarketplaceStoreDto({
      id: "store-1",
      userId: "seller-1",
      storeName: "Store",
      country: "DE",
      user: {
        id: "seller-1",
        fullName: "Seller Name",
        email: "seller-private@example.com",
        passwordHash: "hash",
        verificationStatus: "approved",
      },
    });

    expect(dto.user).toEqual({
      id: "seller-1",
      fullName: "Seller Name",
      verificationStatus: "approved",
    });
    expect(JSON.stringify(dto)).not.toContain("seller-private@example.com");
    expect(JSON.stringify(dto)).not.toContain("passwordHash");
  });
});

