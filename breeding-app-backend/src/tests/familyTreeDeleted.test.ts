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

describe("the family tree and animals that left the collection", () => {
  it("leaves fully deleted rows out of the picker", async () => {
    await listMyAnimals("owner-1");
    expect(db.animal.findMany.mock.calls[0][0].where).toEqual({ ownerId: "owner-1", deletedAt: null });
  });

  it("keeps a dead or deleted sire and dam in the pedigree, labelled", async () => {
    db.animal.findUnique.mockResolvedValue(null);
    db.animal.findFirst.mockResolvedValue(row());
    const deadSire = row({ id: "row-sire", appAnimalId: "M-1", name: "Clown male", sex: "M", status: "Removed", payload: { removed: { reason: "died", date: "2026-10-01" } } });
    const oldDeleted = row({ id: "row-dam", appAnimalId: "F-0", name: "Old dam", deletedAt: new Date("2025-05-05T00:00:00Z") });
    db.parentRelationship.findMany
      .mockResolvedValueOnce([
        { id: "r1", childId: "row-1", parentId: "row-sire", role: "sire", confidence: "confirmed", parent: deadSire },
        { id: "r2", childId: "row-1", parentId: "row-dam", role: "dam", confidence: "confirmed", parent: oldDeleted },
      ])
      .mockResolvedValue([]);

    const result: any = await getSnakePedigree("24-F-012", "owner-1");

    // Looked up by the database id, even though the app id was passed in.
    expect(db.parentRelationship.findMany.mock.calls[0][0].where).toEqual({ childId: "row-1" });
    const sire = result.snakes.find((s: any) => s.id === "row-sire");
    const dam = result.snakes.find((s: any) => s.id === "row-dam");
    expect(sire?.departure).toEqual({ kind: "removed", reason: "died", date: "2026-10-01" });
    expect(dam?.departure).toMatchObject({ kind: "removed", reason: "other", date: "2025-05-05" });
    expect(result.snakes.find((s: any) => s.id === "row-1")?.departure).toBeNull();
  });

  it("labels an archived animal by its reason", async () => {
    db.animal.findUnique.mockResolvedValue(row({ status: "Sold", payload: { archive: { reason: "sold", date: "2026-09-09" } } }));
    const result: any = await getSnakePedigree("row-1", "owner-1");
    expect(result.snakes[0].departure).toEqual({ kind: "archived", reason: "sold", date: "2026-09-09" });
  });

  it("still leaves deleted pairings and clutches out of the clutch list", async () => {
    db.animal.findUnique.mockResolvedValue(row());
    await getSnakePedigree("row-1", "owner-1");
    const pairingQuery = db.pairing.findMany.mock.calls[0][0];
    expect(pairingQuery.where.deletedAt).toBeNull();
    expect(pairingQuery.include.clutches).toEqual({ where: { deletedAt: null } });
  });
});
