import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma", () => ({
  prisma: {
    marketplaceListing: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
    marketplaceFavorite: { findMany: vi.fn() },
    animal: { findMany: vi.fn() },
    shedTestCertificate: { findMany: vi.fn() },
    parentRelationship: { findMany: vi.fn() },
  },
}));

vi.mock("../services/subscriptionService", () => ({ canAccessFeature: vi.fn() }));
vi.mock("../services/notificationService", () => ({ createNotification: vi.fn() }));

import { prisma } from "../lib/prisma";
import { getMarketplaceComparables, listMarketplaceListings } from "../services/marketplaceService";

const db = prisma as any;

/**
 * The `where` the browse query actually sent to Prisma. Gene filters run a
 * narrow candidate query first (it selects, rather than includes), so the
 * browse query is the one carrying `include`.
 */
const whereFor = () =>
  db.marketplaceListing.findMany.mock.calls.find((call: any[]) => call[0]?.include)[0].where;
const andClauses = () => whereFor().AND || [];

beforeEach(() => {
  vi.clearAllMocks();
  db.marketplaceListing.findMany.mockResolvedValue([]);
  db.marketplaceListing.count.mockResolvedValue(0);
  db.marketplaceFavorite.findMany.mockResolvedValue([]);
  db.animal.findMany.mockResolvedValue([]);
  db.shedTestCertificate.findMany.mockResolvedValue([]);
  db.parentRelationship.findMany.mockResolvedValue([]);
});

describe("browse filters", () => {
  it("honours the category filter, which used to render and do nothing", async () => {
    await listMarketplaceListings({ category: "Juvenile" });
    expect(whereFor().category).toEqual({ equals: "Juvenile", mode: "insensitive" });
  });

  it("runs gene include and exclude in the query rather than on the fetched page", async () => {
    db.marketplaceListing.findMany.mockImplementation(async (args: any) =>
      args?.select
        ? [
            { id: "both", genetics: "Clown, Pied" },
            { id: "het-only", genetics: "Clown het Pied" },
            { id: "spider", genetics: "Spider Clown, Pied" },
          ]
        : []
    );

    await listMarketplaceListings({ includeGenes: "Clown, Pied", excludeGenes: "Spider" });

    // The candidate query narrows by mention; the parser decides the match.
    const candidate = db.marketplaceListing.findMany.mock.calls.find((call: any[]) => call[0]?.select)[0];
    expect(candidate.where.OR).toEqual(
      expect.arrayContaining([
        { genetics: { contains: "Clown", mode: "insensitive" } },
        { genetics: { contains: "Pied", mode: "insensitive" } },
        { genetics: { contains: "Spider", mode: "insensitive" } },
      ])
    );
    expect(andClauses()).toEqual(
      expect.arrayContaining([
        // "het Pied" is not a visual Pied, so the het-only animal is out.
        { id: { in: ["both", "spider"] } },
        { id: { notIn: ["spider"] } },
      ])
    );
  });

  it("reads a het filter as a het, and never finds a gene inside another gene", async () => {
    db.marketplaceListing.findMany.mockImplementation(async (args: any) =>
      args?.select
        ? [
            { id: "visual", genetics: "Clown" },
            { id: "het", genetics: "Pastel het Clown" },
            { id: "lavender", genetics: "Lavender Albino" },
            { id: "albino", genetics: "Albino" },
          ]
        : []
    );

    await listMarketplaceListings({ includeGenes: "het Clown" });
    expect(andClauses()).toEqual(expect.arrayContaining([{ id: { in: ["het"] } }]));

    db.marketplaceListing.findMany.mockClear();
    await listMarketplaceListings({ includeGenes: "Albino" });
    expect(andClauses()).toEqual(expect.arrayContaining([{ id: { in: ["albino"] } }]));
  });

  it("offers the species actually listed, for the species filter", async () => {
    db.marketplaceListing.groupBy = vi.fn().mockResolvedValue([
      { species: "Corn snake", _count: { _all: 2 } },
      { species: "Ball python", _count: { _all: 9 } },
      { species: null, _count: { _all: 1 } },
    ]);
    const result = await listMarketplaceListings({});
    expect(result.facets.species).toEqual([
      { species: "Ball python", count: 9 },
      { species: "Corn snake", count: 2 },
    ]);
    delete db.marketplaceListing.groupBy;
  });

  it("runs the weight and verified-breeder filters in the query too", async () => {
    await listMarketplaceListings({ minWeight: "200", maxWeight: "900", verifiedOnly: "true" });

    expect(whereFor().weight).toEqual({ gte: 200, lte: 900 });
    expect(andClauses()).toEqual(
      expect.arrayContaining([
        {
          OR: [
            { seller: { marketplaceStores: { some: { isVerified: true } } } },
            { seller: { verificationStatus: "approved" } },
          ],
        },
      ])
    );
  });

  it("hides sold animals by default and includes them only on request", async () => {
    await listMarketplaceListings({});
    expect(whereFor().status).toEqual({ in: ["available", "reserved"] });

    vi.clearAllMocks();
    db.marketplaceListing.findMany.mockResolvedValue([]);
    db.marketplaceListing.count.mockResolvedValue(0);
    await listMarketplaceListings({ includeSold: "true" });
    expect(whereFor().status).toEqual({ in: ["available", "reserved", "sold"] });
  });

  it("reports the size of the match, not the size of the page", async () => {
    db.marketplaceListing.count.mockResolvedValue(147);
    db.marketplaceListing.findMany.mockResolvedValue([]);

    const result = await listMarketplaceListings({ page: "2", pageSize: "24" });

    expect(result.total).toBe(147);
    expect(result.pageCount).toBe(7);
    expect(result.page).toBe(2);
    expect(result.hasMore).toBe(true);
    expect(db.marketplaceListing.findMany.mock.calls[0][0].skip).toBe(24);
    expect(db.marketplaceListing.findMany.mock.calls[0][0].take).toBe(24);
  });

  it("caps the page size so a crafted query cannot ask for the whole table", async () => {
    await listMarketplaceListings({ pageSize: "5000" });
    expect(db.marketplaceListing.findMany.mock.calls[0][0].take).toBe(48);
  });

  it("no longer pins the query to one species", async () => {
    await listMarketplaceListings({ species: "Corn snake" });
    expect(whereFor().species).toEqual({ equals: "Corn snake", mode: "insensitive" });

    vi.clearAllMocks();
    db.marketplaceListing.findMany.mockResolvedValue([]);
    db.marketplaceListing.count.mockResolvedValue(0);
    await listMarketplaceListings({});
    expect(whereFor().species).toBeUndefined();
  });

  it("marks what a signed-in viewer has already saved, and asks nothing when signed out", async () => {
    db.marketplaceListing.findMany.mockResolvedValue([
      { id: "l1", images: [], seller: null, currency: "EUR" },
      { id: "l2", images: [], seller: null, currency: "EUR" },
    ]);
    db.marketplaceListing.count.mockResolvedValue(2);
    db.marketplaceFavorite.findMany.mockResolvedValue([{ listingId: "l2" }]);

    const signedIn = await listMarketplaceListings({}, { id: "buyer-1", role: "buyer" } as any);
    expect(signedIn.listings.map((row: any) => row.isFavorited)).toEqual([false, true]);

    vi.clearAllMocks();
    db.marketplaceListing.findMany.mockResolvedValue([{ id: "l1", images: [], seller: null, currency: "EUR" }]);
    db.marketplaceListing.count.mockResolvedValue(1);
    await listMarketplaceListings({});
    expect(db.marketplaceFavorite.findMany).not.toHaveBeenCalled();
  });
});

describe("sold comparables", () => {
  it("reports a range once there are enough sales to be worth reporting", async () => {
    db.marketplaceListing.findUnique.mockResolvedValue({
      id: "l1",
      genetics: "Clown, het Pied",
      currency: "EUR",
      species: "Ball python",
    });
    db.marketplaceListing.findMany.mockResolvedValue(
      [1200, 1300, 1400, 1450, 1500, 1650].map((price) => ({ price, currency: "EUR" }))
    );

    const { comparables } = await getMarketplaceComparables("l1");
    expect(comparables.count).toBe(6);
    expect(comparables.low).toBe(1200);
    expect(comparables.high).toBe(1650);
    expect(comparables.median).toBe(1450);
  });

  it("declines to quote a range from one or two sales", async () => {
    db.marketplaceListing.findUnique.mockResolvedValue({ id: "l1", genetics: "Pied", currency: "EUR" });
    db.marketplaceListing.findMany.mockResolvedValue([{ price: 900, currency: "EUR" }]);

    const { comparables } = await getMarketplaceComparables("l1");
    expect(comparables.count).toBe(1);
    expect(comparables.low).toBeNull();
    expect(comparables.median).toBeNull();
  });
});
