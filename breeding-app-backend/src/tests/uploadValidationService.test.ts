import { describe, expect, it } from "vitest";
import { validateMarketplaceUpload } from "../services/uploadValidationService";

describe("upload validation service", () => {
  it("accepts png signatures", () => {
    const result = validateMarketplaceUpload(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]));
    expect(result).toMatchObject({ ok: true, mimeType: "image/png", scanStatus: "passed" });
  });

  it("rejects unsupported files", () => {
    const result = validateMarketplaceUpload(Buffer.from("not an image"));
    expect(result).toMatchObject({ ok: false, scanStatus: "rejected" });
  });
});

