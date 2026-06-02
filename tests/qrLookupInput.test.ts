import { describe, expect, it } from "vitest";
import { buildQrPayload, generateQrToken } from "../src/utils/labToken";
import { canResolveLabQrInput, isLabQrToken, toLabQrResolvePayload } from "../src/features/lab/utils/qrLookupInput";

describe("qrLookupInput", () => {
  it("accepts normalized 64-char hex token input", () => {
    const token = generateQrToken();
    expect(isLabQrToken(token)).toBe(true);
    expect(canResolveLabQrInput(token)).toBe(true);
    expect(toLabQrResolvePayload(token)).toEqual({ qrToken: token });
  });

  it("accepts raw QR payload JSON input", () => {
    const token = generateQrToken();
    const payload = buildQrPayload(token);
    expect(canResolveLabQrInput(payload)).toBe(true);
    expect(toLabQrResolvePayload(payload)).toEqual({ rawQrString: payload });
  });

  it("rejects malformed input", () => {
    const badInput = "not-a-token-or-payload";
    expect(canResolveLabQrInput(badInput)).toBe(false);
    expect(() => toLabQrResolvePayload(badInput)).toThrow(/Invalid QR input/i);
  });
});
