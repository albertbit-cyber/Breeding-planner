declare const require: any;

/**
 * QR payload schema version. Increment when the shape changes incompatibly.
 */
const QR_PAYLOAD_VERSION = 1 as const;

/** Structured payload embedded inside every lab sample QR code. */
export interface QrPayload {
  /** Schema version — allows the scanner to reject unknown formats. */
  v: typeof QR_PAYLOAD_VERSION;
  /** The secure opaque token: 32 crypto-random bytes as 64 lowercase hex chars. */
  t: string;
}

/**
 * Generate a cryptographically secure QR token.
 *
 * Uses `crypto.getRandomValues` in the browser / Electron renderer.
 * Falls back to Node's `crypto.randomBytes` in the Electron main process.
 *
 * @returns 64-character lowercase hex string (256 bits of entropy).
 */
export function generateQrToken(): string {
  if (typeof crypto !== "undefined" && typeof (crypto as Crypto).getRandomValues === "function") {
    const bytes = new Uint8Array(32);
    (crypto as Crypto).getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Node.js / Electron main process fallback
  const { randomBytes } = require("crypto") as typeof import("crypto");
  return randomBytes(32).toString("hex");
}

/**
 * Encode a qrToken into the minimal JSON string that will be embedded in the QR image.
 * The payload contains no PII, no order ID, no animal ID — only an opaque token.
 * Pass the returned string directly to `QRCode.toDataURL(payload)`.
 */
export function buildQrPayload(qrToken: string): string {
  const payload: QrPayload = { v: QR_PAYLOAD_VERSION, t: qrToken };
  return JSON.stringify(payload);
}

/**
 * Parse and validate a raw string decoded from a QR code scan.
 *
 * @throws {Error} with message prefixed `QR_PARSE_ERROR:` — callers can
 *   distinguish parse failures from other errors with `startsWith`.
 */
export function parseQrPayload(raw: string): QrPayload {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new Error("QR_PARSE_ERROR: payload is not valid JSON");
  }

  if (
    typeof obj !== "object" ||
    obj === null ||
    (obj as Record<string, unknown>).v !== QR_PAYLOAD_VERSION ||
    typeof (obj as Record<string, unknown>).t !== "string" ||
    ((obj as Record<string, unknown>).t as string).length !== 64
  ) {
    throw new Error("QR_PARSE_ERROR: unexpected payload shape or unsupported version");
  }

  return obj as QrPayload;
}
