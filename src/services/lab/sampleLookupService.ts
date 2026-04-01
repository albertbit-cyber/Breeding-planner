import type { Sample, TestOrder } from "../../types/lab";
import {
  getSampleRecordById,
  getTestOrderRecordById,
  lookupSampleByQrTokenRecord,
  updateSampleStatusRecord,
} from "../../db/labStore";
import { parseQrPayload } from "../../utils/labToken";
import { canAccessTestOrder, type ServiceActor } from "./testOrderService";

const USERS_STORAGE_KEY = "breedingPlannerUsers";
const QR_TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const SAMPLE_ID_PATTERN = /^[A-Za-z0-9_-]{3,120}$/;

type ElectronBridge = {
  loadData?: () => Promise<Record<string, unknown> | null>;
};

interface StoredUserRecord {
  fullName?: string;
  displayName?: string;
  email?: string;
}

interface AnimalSummary {
  id: string;
  name?: string;
  code?: string;
  sex?: string;
  status?: string;
}

interface BreederSummary {
  userId: string;
  displayName?: string;
}

interface TestOrderLookupSummary {
  id: string;
  orderNumber: string;
  status: TestOrder["status"];
  paymentStatus?: TestOrder["paymentStatus"];
  priority: TestOrder["priority"];
  submittedAt?: string;
}

interface SampleLookupSummary {
  id: string;
  orderId: string;
  status: Sample["status"];
  type: Sample["type"];
  receivedAt?: string;
  qrToken?: string;
  accessionNumber?: string;
  trackingCode?: string;
}

export interface ResolveSampleLookupInput {
  rawQrString?: string;
  qrToken?: string;
  sampleId?: string;
}

export interface ResolveSampleLookupResult {
  lookup: {
    method: "qrToken" | "sampleId";
    sampleId: string;
  };
  sample: SampleLookupSummary;
  testOrder: TestOrderLookupSummary;
  animal: AnimalSummary;
  breeder: BreederSummary | null;
  requestedTests: string[];
}

const assertLabLookupPermissions = (actor: ServiceActor): void => {
  if (actor.role !== "lab_staff" && actor.role !== "admin") {
    throw new Error("Access denied: only lab staff or admins can resolve sample intake lookups.");
  }
};

const normalizeOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const parseLookupInput = (
  input: ResolveSampleLookupInput
): { method: "qrToken" | "sampleId"; qrToken?: string; sampleId?: string } => {
  const rawQrString = normalizeOptionalString(input.rawQrString);
  const qrToken = normalizeOptionalString(input.qrToken);
  const sampleId = normalizeOptionalString(input.sampleId);
  const providedCount = [rawQrString, qrToken, sampleId].filter(Boolean).length;

  if (!providedCount) {
    throw new Error("Invalid lookup input: provide rawQrString, qrToken, or sampleId.");
  }

  if (providedCount > 1) {
    throw new Error("Invalid lookup input: provide exactly one of rawQrString, qrToken, or sampleId.");
  }

  if (rawQrString) {
    const parsed = parseQrPayload(rawQrString);
    return { method: "qrToken", qrToken: parsed.t };
  }

  if (qrToken) {
    if (!QR_TOKEN_PATTERN.test(qrToken)) {
      throw new Error("Invalid qrToken: expected a 64-character lowercase hexadecimal token.");
    }
    return { method: "qrToken", qrToken };
  }

  if (!sampleId || !SAMPLE_ID_PATTERN.test(sampleId)) {
    throw new Error("Invalid sampleId: expected 3-120 URL-safe characters.");
  }

  return { method: "sampleId", sampleId };
};

const getBrowserBridge = (): ElectronBridge | null => {
  if (typeof window === "undefined") return null;
  const typedWindow = window as typeof window & { electronAPI?: ElectronBridge };
  return typedWindow.electronAPI || null;
};

const loadStoredUsers = (): StoredUserRecord[] => {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return [];
  }

  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => entry && typeof entry === "object");
  } catch {
    return [];
  }
};

const resolveAnimalSummary = async (animalId: string): Promise<AnimalSummary> => {
  const fallback: AnimalSummary = { id: animalId };
  const bridge = getBrowserBridge();
  if (!bridge?.loadData) {
    return fallback;
  }

  try {
    const data = await bridge.loadData();
    const snakes = Array.isArray(data?.snakes) ? data.snakes : [];
    const match = snakes.find(
      (entry) => entry && typeof entry === "object" && String((entry as Record<string, unknown>).id ?? "") === animalId
    ) as Record<string, unknown> | undefined;

    if (!match) {
      return fallback;
    }

    return {
      id: animalId,
      name: typeof match.name === "string" ? match.name : undefined,
      code: typeof match.code === "string"
        ? match.code
        : typeof match.displayId === "string"
          ? match.displayId
          : typeof match.externalId === "string"
            ? match.externalId
            : undefined,
      sex: typeof match.sex === "string" ? match.sex : undefined,
      status: typeof match.status === "string" ? match.status : undefined,
    };
  } catch {
    return fallback;
  }
};

const resolveBreederSummary = (userId?: string): BreederSummary | null => {
  if (!userId) return null;

  const normalized = userId.trim().toLowerCase();
  const match = loadStoredUsers().find((entry) => {
    const displayName = typeof entry.displayName === "string" ? entry.displayName.trim().toLowerCase() : "";
    const email = typeof entry.email === "string" ? entry.email.trim().toLowerCase() : "";
    return displayName === normalized || email === normalized;
  });

  return {
    userId,
    displayName: typeof match?.displayName === "string" && match.displayName.trim()
      ? match.displayName.trim()
      : undefined,
  };
};

const toSampleSummary = (sample: Sample): SampleLookupSummary => ({
  id: sample.id,
  orderId: sample.orderId,
  status: sample.status,
  type: sample.type,
  receivedAt: sample.receivedAt,
  qrToken: sample.qrToken,
  accessionNumber: sample.accessionNumber,
  trackingCode: sample.trackingCode,
});

const toTestOrderSummary = (order: TestOrder): TestOrderLookupSummary => ({
  id: order.id,
  orderNumber: order.orderNumber,
  status: order.status,
  paymentStatus: order.paymentStatus,
  priority: order.priority,
  submittedAt: order.submittedAt,
});

export const resolveSampleLookup = async (
  actor: ServiceActor,
  input: ResolveSampleLookupInput
): Promise<ResolveSampleLookupResult> => {
  assertLabLookupPermissions(actor);

  const lookup = parseLookupInput(input);
  const sample = lookup.method === "sampleId"
    ? getSampleRecordById(lookup.sampleId as string)
    : lookupSampleByQrTokenRecord(lookup.qrToken as string);

  if (!sample) {
    throw new Error(
      lookup.method === "sampleId"
        ? "Sample not found for the provided sampleId."
        : "Sample not found for the provided qrToken."
    );
  }

  const order = getTestOrderRecordById(sample.orderId);
  if (!order) {
    throw new Error("The linked test order could not be found for this sample.");
  }

  if (!canAccessTestOrder(actor, order)) {
    throw new Error("Access denied: you do not have permission to access this sample lookup.");
  }

  const animal = await resolveAnimalSummary(order.animalId);
  const breeder = resolveBreederSummary(order.breederUserId || order.requestedByUserId);

  return {
    lookup: {
      method: lookup.method,
      sampleId: sample.id,
    },
    sample: toSampleSummary(sample),
    testOrder: toTestOrderSummary(order),
    animal,
    breeder,
    requestedTests: [...order.requestedTests],
  };
};

export const markSampleAsReceived = async (
  actor: ServiceActor,
  sampleId: string
): Promise<ResolveSampleLookupResult & { alreadyReceived: boolean }> => {
  assertLabLookupPermissions(actor);
  const normalizedSampleId = String(sampleId || "").trim();
  if (!normalizedSampleId) {
    throw new Error("Invalid sampleId: expected 3-120 URL-safe characters.");
  }

  const sample = getSampleRecordById(normalizedSampleId);
  if (!sample) {
    throw new Error("Sample not found for the provided sampleId.");
  }

  const order = getTestOrderRecordById(sample.orderId);
  if (!order) {
    throw new Error("The linked test order could not be found for this sample.");
  }

  if (!canAccessTestOrder(actor, order)) {
    throw new Error("Access denied: you do not have permission to access this sample lookup.");
  }

  const alreadyReceived = sample.status === "sample_received";
  const nextSample = alreadyReceived
    ? sample
    : (updateSampleStatusRecord(
        sample.id,
        "sample_received",
        { userId: actor.userId, role: actor.role },
        "shed_received"
      ) || sample);

  if (!alreadyReceived && !nextSample.receivedAt) {
    nextSample.receivedAt = new Date().toISOString();
  }

  const animal = await resolveAnimalSummary(order.animalId);
  const breeder = resolveBreederSummary(order.breederUserId || order.requestedByUserId);

  return {
    alreadyReceived,
    lookup: {
      method: "sampleId",
      sampleId: nextSample.id,
    },
    sample: toSampleSummary(nextSample),
    testOrder: toTestOrderSummary(order),
    animal,
    breeder,
    requestedTests: [...order.requestedTests],
  };
};
