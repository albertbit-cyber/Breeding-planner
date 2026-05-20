const DEFAULT_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const IMAGE_SIGNATURES: Array<{ mimeType: string; signature: number[] }> = [
  { mimeType: "image/png", signature: [0x89, 0x50, 0x4e, 0x47] },
  { mimeType: "image/jpeg", signature: [0xff, 0xd8, 0xff] },
  { mimeType: "image/gif", signature: [0x47, 0x49, 0x46, 0x38] },
  { mimeType: "image/webp", signature: [0x52, 0x49, 0x46, 0x46] },
];

export type UploadValidationResult = {
  ok: boolean;
  mimeType?: string;
  reason?: string;
  scanStatus: "not_scanned" | "passed" | "rejected";
};

const maxUploadBytes = (): number => {
  const parsed = Number(process.env.MAX_UPLOAD_BYTES || DEFAULT_MAX_UPLOAD_BYTES);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_UPLOAD_BYTES;
};

const detectImageMimeType = (buffer: Buffer): string => {
  const match = IMAGE_SIGNATURES.find((entry) =>
    entry.signature.every((byte, index) => buffer[index] === byte)
  );
  if (match?.mimeType === "image/webp" && buffer.toString("ascii", 8, 12) !== "WEBP") return "";
  return match?.mimeType || "";
};

export const validateMarketplaceUpload = (buffer: Buffer): UploadValidationResult => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { ok: false, reason: "Upload file is empty.", scanStatus: "rejected" };
  }
  if (buffer.length > maxUploadBytes()) {
    return { ok: false, reason: "Upload file is too large.", scanStatus: "rejected" };
  }
  const mimeType = detectImageMimeType(buffer);
  if (!mimeType) {
    return { ok: false, reason: "Unsupported or invalid image file.", scanStatus: "rejected" };
  }
  return { ok: true, mimeType, scanStatus: "passed" };
};

