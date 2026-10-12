import { describe, expect, it } from "vitest";
import { entryHashFor } from "./entryHash";

describe("entryHashFor", () => {
  it("keeps an invitation link intact so the token reaches the AuthGate", () => {
    expect(entryHashFor("#/accept-invite?token=abc123")).toBeNull();
  });

  it("leaves portal routes alone", () => {
    expect(entryHashFor("#/lab/dashboard")).toBeNull();
    expect(entryHashFor("#/admin/shed-tests")).toBeNull();
  });

  it("roots everything else at /lab", () => {
    expect(entryHashFor("")).toBe("#/lab");
    expect(entryHashFor("#/")).toBe("#/lab");
    expect(entryHashFor("#/register")).toBe("#/lab");
  });
});
