import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/config/api", () => ({
  getSharedApiConfig: () => ({ ok: true, baseUrl: "https://api.example.test/api" }),
}));

vi.mock("../shared/apiClient", () => {
  const fn = () => vi.fn().mockResolvedValue({});
  return {
    acceptMarketplaceOffer: fn(),
    addMarketplaceMessage: fn(),
    blockMarketplaceUser: fn(),
    completeMarketplaceSale: fn(),
    createMarketplaceConversation: fn(),
    createMarketplaceListing: fn(),
    createMarketplaceReview: fn(),
    createSavedSearch: fn(),
    deleteSavedSearch: fn(),
    favoriteMarketplaceListing: fn(),
    fetchMarketplaceCatalog: fn(),
    fetchMarketplaceComparables: fn(),
    fetchMarketplaceConversation: fn(),
    fetchMarketplaceConversations: fn(),
    fetchMarketplaceFavorites: fn(),
    fetchMarketplaceListingDetail: fn(),
    fetchMarketplaceReviewableSales: fn(),
    fetchMarketplaceStore: fn(),
    fetchMarketplaceStoreReviews: fn(),
    fetchSavedSearches: fn(),
    fetchSellableAnimals: fn(),
    fetchSellerDashboard: fn(),
    markMarketplaceConversationRead: fn(),
    markSavedSearchRun: fn(),
    reportMarketplaceListing: fn(),
    reportMarketplaceMessage: fn(),
    saveMarketplaceStore: fn(),
    unblockMarketplaceUser: fn(),
    updateMarketplaceListing: fn(),
    updateMarketplaceListingWorkflow: fn(),
  };
});

import * as client from "../shared/apiClient";
import {
  browse,
  completeSale,
  markSearchRun,
  reportListing,
  resolveMediaUrl,
  savedSearches,
  toQuery,
  unblockUser,
} from "./api";

beforeEach(() => vi.clearAllMocks());

describe("toQuery", () => {
  it("sends only the filters that are set", () => {
    expect(toQuery({ search: "", sex: "female", verifiedOnly: true, includeSold: false, minPrice: null })).toEqual({
      sex: "female",
      verifiedOnly: "true",
    });
  });
});

describe("media", () => {
  it("resolves stored media paths against the API, and leaves absolute URLs alone", () => {
    expect(resolveMediaUrl("/marketplace/media/m1")).toBe("https://api.example.test/api/marketplace/media/m1");
    expect(resolveMediaUrl("https://cdn.example.test/a.jpg")).toBe("https://cdn.example.test/a.jpg");
    expect(resolveMediaUrl("")).toBe("");
  });

  it("resolves photo URLs on every browse card", async () => {
    client.fetchMarketplaceCatalog.mockResolvedValue({
      listings: [{ id: "l1", imageUrl: "/marketplace/media/m1", images: [{ imageUrl: "/marketplace/media/m1" }] }],
      facets: { species: [{ species: "Ball python", count: 3 }] },
    });
    const result = await browse({ includeGenes: "het Clown" });
    expect(client.fetchMarketplaceCatalog).toHaveBeenCalledWith({ includeGenes: "het Clown" });
    expect(result.listings[0].images[0].imageUrl).toBe("https://api.example.test/api/marketplace/media/m1");
    expect(result.facets.species).toHaveLength(1);
  });
});

describe("buyer-side calls", () => {
  it("reports a listing with its category and note", async () => {
    await reportListing("l1", { type: "incorrect_genetics", note: "Not a clown" });
    expect(client.reportMarketplaceListing).toHaveBeenCalledWith("l1", { type: "incorrect_genetics", note: "Not a clown" });
  });

  it("completes a sale, unblocks, and marks a saved search as run", async () => {
    await completeSale("sale-1");
    await unblockUser("user-2");
    await markSearchRun("s1");
    expect(client.completeMarketplaceSale).toHaveBeenCalledWith("sale-1", undefined);
    expect(client.unblockMarketplaceUser).toHaveBeenCalledWith("user-2");
    expect(client.markSavedSearchRun).toHaveBeenCalledWith("s1");
  });

  it("returns saved searches with their counts, or an empty list", async () => {
    client.fetchSavedSearches.mockResolvedValue({ searches: [{ id: "s1", matchCount: 4, newSinceLastRun: 1 }] });
    expect(await savedSearches()).toEqual([{ id: "s1", matchCount: 4, newSinceLastRun: 1 }]);
    client.fetchSavedSearches.mockResolvedValue({});
    expect(await savedSearches()).toEqual([]);
  });
});
