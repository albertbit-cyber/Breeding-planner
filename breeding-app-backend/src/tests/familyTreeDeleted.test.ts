import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma", () => ({
  prisma: {
    animal: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
    parentRelationship: { findMany: vi.fn() },
    ownershipHistory: { findMany: vi.fn() },
    pairing: { findMany: vi.fn() },
  },
}));

import { prisma } from "../lib/prisma";
import { getSnakePedigree, listMyAnimals } from "../services/familyTreeService";

const db = prisma as any;
const row = (over: Record<string, unknown> = {}) => ({
  id: "row-1",
  appAnimalId: "24-F-012",
  ownerId: "owner-1",
  name: "Nala",
  sex: "F",
  status: "Breeder",
  privacyLevel: "public",
  payload: {},
  deletedAt: null,
  owner: { id: "owner-1", fullName: "Keeper", profile: null },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.animal.findMany.mockResolvedValue([]);
  db.parentRelationship.findMany.mockResolvedValue([]);
  db.ownershipHistory.findMany.mockResolvedValue([]);
  db.pairing.findMany.mockResolvedValue([]);
});

describe("the family tree and deleted animals", () => {
  it("lists only animals that are not deleted (archived ones stay)", async () => {
    await listMyAnimals("owner-1");
    expect(db.animal.findMany.mock.calls[0][0].where).toEqual({ ownerId: "owner-1", deletedAt: null });
  });

  it("answers 404 for a deleted animal", async () => {
    db.animal.findUnique.mockResolvedValue(row({ deletedAt: new Date("2026-10-01") }));
    await expect(getSnakePedigree("row-1", "owner-1")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("leaves deleted parents, offspring, pairings and clutches out of a pedigree", async () => {
    db.animal.findUnique.mockResolvedValue(null);
    db.animal.findFirst.mockResolvedValue(row());

    await getSnakePedigree("24-F-012", "owner-1");

    const relWheres = db.parentRelationship.findMany.mock.calls.map((call: any[]) => call[0].where);
    // Looked up by the database id, even though the app id was passed in.
    expect(relWheres[0]).toEqual({ childId: "row-1", parent: { deletedAt: null } });
    expect(relWheres[relWheres.length - 1]).toEqual({ parentId: "row-1", child: { deletedAt: null } });
    const pairingQuery = db.pairing.findMany.mock.calls[0][0];
    expect(pairingQuery.where.deletedAt).toBeNull();
    expect(pairingQuery.include.clutches).toEqual({ where: { deletedAt: null } });
  });
});
