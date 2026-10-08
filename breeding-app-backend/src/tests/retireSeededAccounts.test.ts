import { describe, expect, it, vi } from "vitest";
import { retireSeededAccounts } from "../../scripts/lib/retireSeededAccounts";
import { SEEDED_ACCOUNTS, isSeededAddress } from "../../scripts/seededAccounts";

/**
 * The script that neutralises the accounts the 22 September 2026 audit found.
 * What matters here is what it refuses to do: touch a non-seeded address,
 * write anything without confirm, or delete a row that owns orders or holds a
 * lab organization together.
 */

type Row = {
  id: string;
  email: string;
  role: string;
  status: string;
  isActive: boolean;
  membership?: { role: string; organization: { id: string; name: string } } | null;
};

const fakeDb = (rows: Row[], counts: { members?: number; placed?: number; received?: number } = {}) => {
  const byEmail = new Map(rows.map((row) => [row.email, row]));
  return {
    user: {
      findUnique: vi.fn(async ({ where }: any) => byEmail.get(where.email) || null),
      update: vi.fn(async ({ data }: any) => ({ status: data.status, isActive: data.isActive })),
      delete: vi.fn(async () => ({})),
    },
    membership: { count: vi.fn(async () => counts.members ?? 0) },
    shedTestOrder: {
      count: vi.fn(async ({ where }: any) =>
        where.breederId !== undefined ? counts.placed ?? 0 : counts.received ?? 0
      ),
    },
    refreshSession: { updateMany: vi.fn(async () => ({ count: 1 })) },
    adminAuditLog: { create: vi.fn(async () => ({})) },
  };
};

const seededAdmin: Row = {
  id: "u-admin",
  email: "admin@breedingplanner.dev",
  role: "admin",
  status: "active",
  isActive: true,
  membership: null,
};

const seededLab: Row = {
  id: "u-lab",
  email: "lab@proherper.dev",
  role: "lab",
  status: "active",
  isActive: true,
  membership: { role: "owner", organization: { id: "org-ph", name: "ProHerper Lab" } },
};

const fixedNow = () => new Date("2026-10-08T12:00:00.000Z");
const hashPassword = async (password: string) => `hashed:${password}`;

describe("seeded address list", () => {
  it("names every address the seed scripts write, case-insensitively", () => {
    expect(isSeededAddress("Admin@BreedingPlanner.dev")).toBe(true);
    expect(isSeededAddress("lab@proherper.dev")).toBe(true);
    expect(isSeededAddress("morphshaman@gmail.com")).toBe(false);
    expect(Object.keys(SEEDED_ACCOUNTS)).toEqual(
      expect.arrayContaining([
        "admin@breedingplanner.dev",
        "admin@proherper.dev",
        "lab@proherper.dev",
        "breeder@proherper.dev",
      ])
    );
  });
});

describe("retireSeededAccounts", () => {
  it("refuses an address that is not seeded and writes nothing", async () => {
    const db = fakeDb([{ ...seededAdmin, email: "admin@staging.com" }]);
    const [outcome] = await retireSeededAccounts(db, { emails: ["admin@staging.com"], confirm: true });

    expect(outcome.action).toBe("skipped");
    expect(outcome.reason).toMatch(/not a seeded address/);
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("dry-runs by default: reports the plan and writes nothing", async () => {
    const db = fakeDb([seededAdmin]);
    const [outcome] = await retireSeededAccounts(db, { emails: ["admin@breedingplanner.dev"] });

    expect(outcome.action).toBe("would-neutralise");
    expect(outcome.role).toBe("admin");
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it("neutralises: rotates the password, suspends, revokes sessions, marks for deletion, logs", async () => {
    const db = fakeDb([seededAdmin]);
    const [outcome] = await retireSeededAccounts(db, {
      emails: ["ADMIN@breedingplanner.dev "],
      confirm: true,
      now: fixedNow,
      randomPassword: () => "fresh-random",
      hashPassword,
    });

    expect(outcome.action).toBe("neutralised");

    const update = db.user.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: "u-admin" });
    expect(update.data).toEqual({
      passwordHash: "hashed:fresh-random",
      status: "suspended",
      isActive: false,
      refreshToken: null,
      deletionRequestedAt: fixedNow(),
    });

    expect(db.refreshSession.updateMany).toHaveBeenCalledWith({
      where: { userId: "u-admin", revokedAt: null },
      data: { revokedAt: fixedNow() },
    });

    const audit = db.adminAuditLog.create.mock.calls[0][0].data;
    expect(audit.action).toBe("user_suspended");
    expect(audit.targetUserId).toBe("u-admin");
    expect(audit.adminUserId).toBeNull();
    expect(audit.reason).toMatch(/admin1234/);
    expect(audit.afterJson).toEqual({ status: "suspended", isActive: false, passwordRotated: true });

    expect(db.user.delete).not.toHaveBeenCalled();
  });

  it("never stores the published password again: the hash is of a fresh random value", async () => {
    const db = fakeDb([seededAdmin]);
    const seen: string[] = [];
    await retireSeededAccounts(db, {
      emails: ["admin@breedingplanner.dev"],
      confirm: true,
      hashPassword: async (password) => {
        seen.push(password);
        return `hashed:${password}`;
      },
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]).not.toBe("admin1234");
    expect(seen[0].length).toBeGreaterThanOrEqual(32);
  });

  it("keeps the lab vendor's organization intact when neutralising its owner", async () => {
    const db = fakeDb([seededLab], { members: 1, received: 2 });
    const [outcome] = await retireSeededAccounts(db, {
      emails: ["lab@proherper.dev"],
      confirm: true,
      hashPassword,
    });

    expect(outcome.action).toBe("neutralised");
    expect(outcome.organization).toEqual({ id: "org-ph", name: "ProHerper Lab", members: 1 });
    expect(outcome.ordersReceivedByOrg).toBe(2);
    expect(db.user.delete).not.toHaveBeenCalled();
  });

  it("refuses to delete an account that holds a lab organization with orders", async () => {
    const db = fakeDb([seededLab], { members: 1, received: 2 });
    const [outcome] = await retireSeededAccounts(db, {
      emails: ["lab@proherper.dev"],
      mode: "delete",
      confirm: true,
    });

    expect(outcome.action).toBe("skipped");
    expect(outcome.reason).toMatch(/member of ProHerper Lab/);
    expect(outcome.reason).toMatch(/2 lab order\(s\) received/);
    expect(db.user.delete).not.toHaveBeenCalled();
    expect(db.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it("refuses to delete an account that placed lab orders, because they would cascade", async () => {
    const db = fakeDb([{ ...seededAdmin, email: "breeder@proherper.dev", role: "breeder" }], { placed: 3 });
    const [outcome] = await retireSeededAccounts(db, {
      emails: ["breeder@proherper.dev"],
      mode: "delete",
      confirm: true,
    });

    expect(outcome.action).toBe("skipped");
    expect(outcome.reason).toMatch(/3 lab order\(s\) placed/);
    expect(db.user.delete).not.toHaveBeenCalled();
  });

  it("deletes an account that owns nothing, logging first", async () => {
    const db = fakeDb([seededAdmin]);
    const [outcome] = await retireSeededAccounts(db, {
      emails: ["admin@breedingplanner.dev"],
      mode: "delete",
      confirm: true,
    });

    expect(outcome.action).toBe("deleted");
    expect(db.adminAuditLog.create.mock.calls[0][0].data.action).toBe("user_deleted");
    expect(db.user.delete).toHaveBeenCalledWith({ where: { id: "u-admin" } });
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("reports an address that does not exist on this database as skipped", async () => {
    const db = fakeDb([]);
    const [outcome] = await retireSeededAccounts(db, { emails: ["lab-b@proherper.dev"], confirm: true });

    expect(outcome.action).toBe("skipped");
    expect(outcome.reason).toMatch(/no such account/);
  });

  it("handles several addresses in one call and keeps going past a refusal", async () => {
    const db = fakeDb([seededAdmin, seededLab], { members: 1, received: 2 });
    const outcomes = await retireSeededAccounts(db, {
      emails: ["admin@breedingplanner.dev", "morphshaman@gmail.com", "lab@proherper.dev"],
      confirm: true,
      hashPassword,
    });

    expect(outcomes.map((outcome) => outcome.action)).toEqual(["neutralised", "skipped", "neutralised"]);
  });
});
