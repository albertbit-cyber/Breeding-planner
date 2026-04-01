import { parseQrPayload } from "../../../utils/labToken";

const QR_TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const SAMPLE_ID_PATTERN = /^[A-Za-z0-9_-]{3,120}$/;

export const isLabQrToken = (value: string): boolean => QR_TOKEN_PATTERN.test(String(value || "").trim());
export const isLabSampleId = (value: string): boolean => SAMPLE_ID_PATTERN.test(String(value || "").trim());

const isRawQrPayload = (value: string): boolean => {
  const normalized = String(value || "").trim();
  if (!normalized) return false;
  try {
    parseQrPayload(normalized);
    return true;
  } catch {
    return false;
  }
};

export const canResolveLabQrInput = (value: string): boolean => {
  const normalized = String(value || "").trim();
  if (!normalized) return false;
  return isLabQrToken(normalized) || isRawQrPayload(normalized) || isLabSampleId(normalized);
};

export const toLabQrResolvePayload = (
  value: string
): {
  qrToken?: string;
  rawQrString?: string;
  sampleId?: string;
} => {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error("QR input is required.");
  }

  if (isLabQrToken(normalized)) {
    return { qrToken: normalized };
  }

  if (isRawQrPayload(normalized)) {
    return { rawQrString: normalized };
  }

  if (isLabSampleId(normalized)) {
    return { sampleId: normalized };
  }

  throw new Error("Invalid lookup input. Use a 64-char token, a valid QR payload JSON string, or a sample ID.");
};
