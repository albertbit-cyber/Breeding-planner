import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma", () => ({
  prisma: {
    marketplaceListing: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    adminAuditLog: { create: vi.fn() },
  },
}));
vi.mock("../services/marketplaceListingPhotos", () => ({ syncListingPhotosFromAnimal: vi.fn() }));

import { prisma } from "../lib/prisma";
import { syncListingPhotosFromAnimal } from "../services/marketplaceListingPhotos";
import { listAdminListings, moderateListing, refreshListingPhotos } from "../services/marketplaceAdminService";

const db = prisma as any;
const admin = { id: "admin-1", role: "admin" } as any;
const moderator = { id: "mod-1", role: "moderator" } as any;
const breeder = { id: "b-1", role: "breeder" } as any;

beforeEach(() => {
  vi.clearAllMocks();
  db.adminAuditLog.create.mockResolvedValue({});
  db.marketplaceListing.findUnique.mockResolvedValue({ id: "l1", sellerUserId: "s1", status: "draft", isFeatured: false, archivedAt: null, publishedAt: null });
  db.marketplaceListing.update.mockImplementation(async ({ data }: any) => ({ id: "l1", sellerUserId: "s1", images: [], ...data }));
});

describe("moderating a listing", () => {
  it("features with the flag, without touching the status", async () => {
    await moderateListing(admin, "l1", { isFeatured: true });
    expect(db.marketplaceListing.update.mock.calls[0][0].data).toEqual({ isFeatured: true });
  });

  it("approving publishes it into browse", async () => {
    await moderateListing(admin, "l1", { status: "available" });
    const data = db.marketplaceListing.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: "available", availability: "available", archivedAt: null });
    expect(data.publishedAt).toBeInstanceOf(Date);
  });

  it("archives by date, keeping the status it had", async () => {
    await moderateListing(admin, "l1", { status: "archived" });
    const data = db.marketplaceListing.update.mock.calls[0][0].data;
    expect(data.archivedAt).toBeInstanceOf(Date);
    expect(data.status).toBeUndefined();
  });

  it("refuses a status that is not one", async () => {
    await expect(moderateListing(admin, "l1", { status: "featured" })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("is admin-only: moderators read, they do not change", async () => {
    await expect(moderateListing(moderator, "l1", { status: "hidden" })).rejects.toMatchObject({ statusCode: 403 });
    await expect(moderateListing(breeder, "l1", { status: "hidden" })).rejects.toMatchObject({ statusCode: 403 });
  });

  it("writes an audit entry", async () => {
    await moderateListing(admin, "l1", { status: "hidden", reason: "Wrong species" });
    expect(db.adminAuditLog.create.mock.calls[0][0].data).toMatchObject({ action: "marketplace_listing_moderated", reason: "Wrong species" });
  });
});

describe("the ads table", () => {
  it("lets a moderator read it, filtered and paged", async () => {
    db.marketplaceListing.findMany.mockResolvedValue([]);
    db.marketplaceListing.count.mockResolvedValue(0);
    const result = await listAdminListings(moderator, { status: "no_photos", page: "2", pageSize: "10" });
    const query = db.marketplaceListing.findMany.mock.calls[0][0];
    expect(query.where).toMatchObject({ archivedAt: null, images: { none: {} } });
    expect(query.skip).toBe(10);
    expect(result).toMatchObject({ page: 2, pageSize: 10, total: 0 });
  });
});

describe("the photo backfill", () => {
  it("runs over every unarchived listing tied to an animal and sums up", async () => {
    db.marketplaceListing.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }]);
    (syncListingPhotosFromAnimal as any)
      .mockResolvedValueOnce({ photos: 3, changed: true })
      .mockResolvedValueOnce({ photos: 0, changed: false, skipped: "no stored photos" })
      .mockRejectedValueOnce(new Error("boom"));
    const summary = await refreshListingPhotos(admin);
    expect(db.marketplaceListing.findMany.mock.calls[0][0].where).toEqual({ archivedAt: null, animalId: { not: null } });
    expect(summary).toEqual({ checked: 3, updated: 1, withPhotos: 1, skipped: { "no stored photos": 1, error: 1 } });
  });
});
