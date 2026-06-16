import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma", () => ({
  prisma: {
    savedSearch: {
      create: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "../lib/prisma";
import {
  deleteMarketplaceSearch,
  listMySavedSearches,
  saveMarketplaceSearch,
} from "../services/savedSearchService";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked((prisma as any).savedSearch.findMany).mockResolvedValue([]);
  vi.mocked((prisma as any).savedSearch.create).mockResolvedValue({
    id: "search-1",
    ownerId: "buyer-1",
    name: "Clown females",
    filters: { search: "clown", sex: "female", location: "", maxPrice: "" },
    createdAt: new Date("2026-05-01T10:00:00.000Z"),
    updatedAt: new Date("2026-05-01T10:00:00.000Z"),
  });
  vi.mocked((prisma as any).savedSearch.findUnique).mockResolvedValue({
    id: "search-1",
    ownerId: "buyer-1",
  });
  vi.mocked((prisma as any).savedSearch.delete).mockResolvedValue({ id: "search-1" });
});

describe("savedSearchService", () => {
  it("lists saved searches owned by the actor", async () => {
    vi.mocked((prisma as any).savedSearch.findMany).mockResolvedValue([
      {
        id: "search-1",
        ownerId: "buyer-1",
        name: "Clown females",
        filters: { search: "clown", sex: "female" },
        createdAt: new Date("2026-05-01T10:00:00.000Z"),
        updatedAt: new Date("2026-05-01T10:00:00.000Z"),
      },
    ]);

    await expect(listMySavedSearches({ id: "buyer-1", role: "buyer" })).resolves.toEqual([
      expect.objectContaining({
        id: "search-1",
        name: "Clown females",
        filters: expect.objectContaining({ search: "clown" }),
      }),
    ]);

    expect((prisma as any).savedSearch.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { ownerId: "buyer-1" },
    }));
  });

  it("saves sanitized marketplace filters", async () => {
    await expect(saveMarketplaceSearch(
      { id: "buyer-1", role: "buyer" },
      {
        name: " Clown   females ",
        filters: { search: " clown ", sex: "female", location: "Berlin", maxPrice: "500" },
      }
    )).resolves.toMatchObject({
      id: "search-1",
      name: "Clown females",
    });

    expect((prisma as any).savedSearch.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        ownerId: "buyer-1",
        name: "Clown females",
        filters: {
          search: "clown",
          sex: "female",
          location: "Berlin",
          maxPrice: "500",
        },
      }),
    }));
  });

  it("rejects searches without a name or filters", async () => {
    await expect(saveMarketplaceSearch({ id: "buyer-1", role: "buyer" }, {
      name: "",
      filters: { search: "clown" },
    })).rejects.toThrow("Saved search name is required.");

    await expect(saveMarketplaceSearch({ id: "buyer-1", role: "buyer" }, {
      name: "Empty",
      filters: {},
    })).rejects.toThrow("At least one marketplace filter is required.");
  });

  it("deletes own searches and blocks other users", async () => {
    await expect(deleteMarketplaceSearch({ id: "buyer-1", role: "buyer" }, "search-1"))
      .resolves.toEqual({ id: "search-1" });

    vi.mocked((prisma as any).savedSearch.findUnique).mockResolvedValue({
      id: "search-2",
      ownerId: "buyer-2",
    });

    await expect(deleteMarketplaceSearch({ id: "buyer-1", role: "buyer" }, "search-2"))
      .rejects.toThrow("You can only delete your own saved searches.");
  });
});
