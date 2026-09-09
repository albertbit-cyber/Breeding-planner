import { describe, it, expect } from "vitest";
import { canRoleUsePortal, normalizeRole, isStaffRole } from "./portalAccess";

/**
 * The client half of the separation. The server refuses the credentials; this
 * is what stops the app from rendering a console for someone it will refuse —
 * the reported symptom was the admin page appearing, empty, for a breeder.
 *
 * An identical copy of this file sits in each app, because the four frontends
 * have diverged and share no build. If one drifts, the others must not.
 */
describe("who may open which app", () => {
  it("keeps a breeder out of the admin console and the laboratory portal", () => {
    expect(canRoleUsePortal("breeder", "admin")).toBe(false);
    expect(canRoleUsePortal("breeder", "lab")).toBe(false);
    expect(canRoleUsePortal("breeder", "breeder")).toBe(true);
    expect(canRoleUsePortal("breeder", "marketplace")).toBe(true);
  });

  it("keeps a laboratory account out of the admin console and the breeder app", () => {
    expect(canRoleUsePortal("lab", "admin")).toBe(false);
    expect(canRoleUsePortal("lab", "breeder")).toBe(false);
    expect(canRoleUsePortal("lab", "lab")).toBe(true);
  });

  it("keeps a buyer to the marketplace", () => {
    expect(canRoleUsePortal("buyer", "marketplace")).toBe(true);
    expect(canRoleUsePortal("buyer", "breeder")).toBe(false);
    expect(canRoleUsePortal("buyer", "admin")).toBe(false);
  });

  it("lets staff into every app", () => {
    for (const role of ["admin", "super_admin", "moderator"]) {
      for (const portal of ["admin", "lab", "breeder", "marketplace"]) {
        expect(canRoleUsePortal(role, portal), `${role} → ${portal}`).toBe(true);
      }
    }
  });

  it("reads a stored role the way the server does", () => {
    // `lab` is what the database holds; `lab_staff` is what it means.
    expect(normalizeRole("lab")).toBe("lab_staff");
    // `support` used to normalize to `admin`, which handed it the full key.
    expect(normalizeRole("support")).toBe("moderator");
    expect(isStaffRole("support")).toBe(true);
    expect(canRoleUsePortal("support", "admin")).toBe(true);
  });

  it("treats an empty or unknown role as belonging nowhere", () => {
    for (const portal of ["admin", "lab", "breeder", "marketplace"]) {
      expect(canRoleUsePortal("", portal)).toBe(false);
      expect(canRoleUsePortal(undefined, portal)).toBe(false);
      expect(canRoleUsePortal("nonsense", portal)).toBe(false);
    }
  });
});
