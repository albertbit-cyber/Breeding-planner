import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { signAuthToken } from "../utils/jwt";

/**
 * The bug this guards against: a snake could be published successfully and
 * still be invisible on the marketplace, because the write and the read used
 * two different tables -- and, once that was fixed, because a listing created
 * as a "draft" fails the browse filter.
 *
 * So this test refuses to assert on either half alone. It publishes over HTTP
 * exactly as the breeder app does, then browses over HTTP exactly as the
 * marketplace website does, against one shared in-memory table.
 */

const rows: any[] = [];

const matches = (row: any, where: any = {}): boolean => {
  if (where.archivedAt === null && row.archivedAt != null) return false;
  if (where.status?.in && !where.status.in.includes(row.status)) return false;
  if (where.availability?.in && !where.availability.in.includes(row.availability)) return false;
  if (where.sellerUserId && row.sellerUserId !== where.sellerUserId) return false;
  if (where.animalId && row.animalId !== where.animalId) return false;
  return true;
};

vi.mock("../lib/prisma", () => ({
  prisma: {
    marketplaceListing: {
      create: vi.fn(async ({ data }: any) => {
        const { images, ...rest } = data;
        const row = { id: `listing-${rows.length + 1}`, archivedAt: null, ...rest, images: images?.create || [], seller: null };
        rows.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = rows.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      }),
      findFirst: vi.fn(async ({ where }: any) => rows.find((row) => matches(row, where)) || null),
      findUnique: vi.fn(async ({ where }: any) => rows.find((row) => row.id === where.id) || null),
      findMany: vi.fn(async ({ where }: any) => rows.filter((row) => matches(row, where))),
      count: vi.fn(async ({ where }: any) => rows.filter((row) => matches(row, where)).length),
    },
    marketplaceListingImage: { deleteMany: vi.fn(), createMany: vi.fn() },
    marketplaceFavorite: { findMany: vi.fn(async () => []) },
    $transaction: vi.fn(),
  },
}));

vi.mock("../services/subscriptionService", () => ({
  canAccessFeature: vi.fn(async () => ({ allowed: true })),
}));
vi.mock("../services/marketplaceRecordService", () => ({
  buildListingRecord: vi.fn(async () => null),
  buildListingRecords: vi.fn(async () => new Map()),
  findUnpublishedEvidence: vi.fn(async () => []),
}));

import { app } from "../app";
import { prisma } from "../lib/prisma";

const db = prisma as any;

const breederToken = signAuthToken({ sub: "breeder-1", email: "breeder@example.com", role: "breeder" });

/** Exactly what buildMarketplaceListingPayload sends from the animal editor. */
const publishBody = {
  animalId: "26-M-004",
  title: "Kingsley",
  species: "Ball python",
  genetics: "Clown, het Pied",
  sex: "Male",
  price: 450,
  currency: "GBP",
  description: "Feeding on frozen-thawed rats, never refused.",
  status: "available",
};

const publish = (body: Record<string, unknown>) =>
  request(app).post("/api/marketplace/listings").set("Authorization", `Bearer ${breederToken}`).send(body);

/** The marketplace website's own request: no filters, signed out. */
const browse = () => request(app).get("/api/marketplace/listings");

beforeEach(() => {
  rows.length = 0;
  db.$transaction.mockImplementation(async (fn: any) => fn(db));
});

describe("a snake marked for sale reaches the marketplace", () => {
  it("shows up in an anonymous visitor's browse, with the four fields the breeder filled in", async () => {
    expect((await publish(publishBody)).status).toBe(201);

    const res = await browse();
    expect(res.status).toBe(200);
    expect(res.body.listings).toHaveLength(1);
    expect(res.body.listings[0]).toMatchObject({
      title: "Kingsley",
      genetics: "Clown, het Pied",
      price: 450,
      currency: "GBP",
      description: "Feeding on frozen-thawed rats, never refused.",
    });
  });

  it("shows one card, not two, when the animal is saved again", async () => {
    await publish(publishBody);
    await publish({ ...publishBody, price: 400, description: "Price reduced." });

    const res = await browse();
    expect(res.body.listings).toHaveLength(1);
    expect(res.body.listings[0]).toMatchObject({ price: 400, description: "Price reduced." });
  });

  it("drops off the marketplace when the breeder switches For Sale back off", async () => {
    await publish(publishBody);
    expect((await browse()).body.listings).toHaveLength(1);

    await publish({ ...publishBody, status: "draft" });

    expect((await browse()).body.listings).toHaveLength(0);
  });

  it("is still listed when the breeder left the price blank", async () => {
    await publish({ ...publishBody, price: "" });

    const res = await browse();
    expect(res.body.listings).toHaveLength(1);
    expect(res.body.listings[0].price ?? null).toBeNull();
  });
});
