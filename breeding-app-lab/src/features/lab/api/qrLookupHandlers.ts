import {
  markSampleAsReceived,
  resolveSampleLookup,
  type ResolveSampleLookupInput,
  type ResolveSampleLookupResult,
} from "../../../services/lab/sampleLookupService";
import type { ServiceActor } from "../../../services/lab/testOrderService";

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export type QrApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "QR_INVALID"
  | "INTERNAL_ERROR";

export interface QrApiSuccess<T> {
  ok: true;
  data: T;
}

export interface QrApiFailure {
  ok: false;
  error: {
    code: QrApiErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

export type QrApiResponse<T> = QrApiSuccess<T> | QrApiFailure;

// ---------------------------------------------------------------------------
// Context and payload
// ---------------------------------------------------------------------------

export interface QrRequestContext {
  actor?: ServiceActor;
}

export interface ResolveQrTokenPayload {
  /** Raw string decoded from a QR code scan (before any parsing). */
  rawQrString?: string;
  /** Safe direct lookup path for already-decoded token values. */
  qrToken?: string;
  /** Manual/sample-label lookup fallback. */
  sampleId?: string;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type ResolvedQrResult = ResolveSampleLookupResult;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const fail = (
  code: QrApiErrorCode,
  message: string,
  details?: Record<string, unknown>
): QrApiFailure => ({
  ok: false,
  error: { code, message, ...(details ? { details } : {}) },
});

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

const mapLookupError = (error: unknown): QrApiFailure => {
  const message = error instanceof Error ? error.message : "Unexpected error during QR resolution.";
  const normalized = message.toLowerCase();

  if (normalized.includes("authentication required")) {
    return fail("UNAUTHORIZED", message);
  }

  if (normalized.includes("access denied") || normalized.includes("permission")) {
    return fail("FORBIDDEN", message);
  }

  if (normalized.includes("qr_parse_error") || normalized.includes("invalid qrtoken")) {
    return fail("QR_INVALID", message, {
      expectedQrTokenFormat: "64-character lowercase hexadecimal token",
    });
  }

  if (normalized.includes("invalid lookup input") || normalized.includes("invalid sampleid")) {
    return fail("VALIDATION_ERROR", message);
  }

  if (normalized.includes("not found") || normalized.includes("could not be found")) {
    return fail("NOT_FOUND", message);
  }

  return fail("INTERNAL_ERROR", message);
};

export const resolveQrTokenHandler = async (
  ctx: QrRequestContext,
  payload: ResolveQrTokenPayload
): Promise<QrApiResponse<ResolvedQrResult>> => {
  try {
    if (!ctx.actor) {
      return fail("UNAUTHORIZED", "Authentication required.");
    }

    const lookupInput: ResolveSampleLookupInput = {
      rawQrString: payload?.rawQrString,
      qrToken: payload?.qrToken,
      sampleId: payload?.sampleId,
    };

    const result = await resolveSampleLookup(ctx.actor, lookupInput);
    return { ok: true, data: result };
  } catch (error) {
    return mapLookupError(error);
  }
};

export const markSampleReceivedHandler = async (
  ctx: QrRequestContext,
  payload: { sampleId: string }
): Promise<QrApiResponse<ResolvedQrResult & { alreadyReceived: boolean }>> => {
  try {
    if (!ctx.actor) {
      return fail("UNAUTHORIZED", "Authentication required.");
    }
    const sampleId = String(payload?.sampleId || "").trim();
    if (!sampleId) {
      return fail("VALIDATION_ERROR", "sampleId is required.");
    }
    const result = await markSampleAsReceived(ctx.actor, sampleId);
    return { ok: true, data: result };
  } catch (error) {
    return mapLookupError(error);
  }
};

// ---------------------------------------------------------------------------
// Handler registry
// ---------------------------------------------------------------------------

export const QR_LOOKUP_API_HANDLERS = {
  "lab.qr.resolve": resolveQrTokenHandler,
  "lab.qr.markReceived": markSampleReceivedHandler,
} as const;
