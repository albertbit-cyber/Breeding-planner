import { describe, expect, it } from "vitest";
import {
  assertAdminActor,
  assertOwnerOrAdmin,
  assertSellerActor,
  isAdminActor,
  isLabActor,
  permissionAuditSummary,
} from "../services/permissionHelpers";

describe("permission helper modules", () => {
  it("recognizes admin and lab role groups", () => {
    expect(isAdminActor({ role: "admin" as any })).toBe(true);
    expect(isAdminActor({ role: "super_admin" as any })).toBe(true);
    expect(isAdminActor({ role: "breeder" as any })).toBe(false);
    expect(isLabActor({ role: "lab_staff" as any })).toBe(true);
    expect(isLabActor({ role: "lab_owner" as any })).toBe(true);
    expect(isLabActor({ role: "admin" as any })).toBe(true);
  });

  it("allows owners and admins but blocks other actors", () => {
    expect(() => assertOwnerOrAdmin({ id: "owner-1", role: "breeder" as any }, "owner-1")).not.toThrow();
    expect(() => assertOwnerOrAdmin({ id: "admin-1", role: "admin" as any }, "owner-1")).not.toThrow();
    expect(() => assertOwnerOrAdmin({ id: "other-1", role: "breeder" as any }, "owner-1")).toThrow("You cannot access this resource.");
  });

  it("keeps marketplace seller/admin assertions explicit", () => {
    expect(() => assertSellerActor({ role: "breeder" as any })).not.toThrow();
    expect(() => assertSellerActor({ role: "admin" as any })).not.toThrow();
    expect(() => assertSellerActor({ role: "buyer" as any })).toThrow("Only breeder or admin users can manage marketplace listings.");

    expect(() => assertAdminActor({ role: "admin" as any })).not.toThrow();
    expect(() => assertAdminActor({ role: "breeder" as any })).toThrow("Only admin users can perform this action.");
  });

  it("creates non-secret audit summaries", () => {
    expect(permissionAuditSummary(
      { id: "actor-1", role: "breeder" as any },
      "listing:listing-1",
      false,
      "owner_mismatch"
    )).toEqual({
      actorId: "actor-1",
      actorRole: "breeder",
      resource: "listing:listing-1",
      allowed: false,
      reason: "owner_mismatch",
    });
  });
});

