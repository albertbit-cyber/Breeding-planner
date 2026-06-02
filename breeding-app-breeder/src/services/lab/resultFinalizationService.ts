import {
  getCertificateRecordById,
  getTestOrderRecordById,
  listLabRecordsByAnimal,
  listCertificateRecordsByOrderId,
  listTestResultRecordsByOrderId,
} from "../../db/labStore";
import type { GeneticsSnapshot, TestOrder, TestResult } from "../../types/lab";
import type { TestOrderStatus } from "../../types/labStatus";
import { applyConfirmedResultGeneticsUpdate, type GeneticsUpdateEngineResult } from "./geneticsUpdateEngine";
import { issueCertificateForCompletedOrder } from "./certificateService";
import { emitShedWorkflowEvent } from "./workflowEvents";
import type { ServiceActor } from "./testOrderService";

export type { GeneticsUpdateEngineResult };

type SnakeRecord = {
  id: string;
  morphs?: unknown;
  hets?: unknown;
  possibleHets?: unknown;
};

type ElectronBridge = {
  loadData?: () => Promise<Record<string, unknown> | null>;
};

const FINALIZABLE_ORDER_STATUSES = new Set<TestOrderStatus>([
  "result_entered",
  "result_reviewed",
  "completed",
  "certificate_issued",
]);

const FINAL_RESULT_STATUSES = new Set<TestResult["status"]>(["completed", "reviewed", "released"]);

const LAB_CONFIRMED_OUTCOMES = new Set(["positive", "carrierDetected"]);

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  value.forEach((entry) => {
    const normalized = String(entry ?? "").trim();
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(normalized);
  });
  return out;
};

const canAccessOrder = (actor: ServiceActor, order: TestOrder): boolean => {
  if (actor.role === "admin") return true;
  if (actor.role === "lab_staff") {
    return Boolean(actor.labId && actor.labId === order.labId);
  }
  return order.requestedByUserId === actor.userId || order.breederUserId === actor.userId;
};

const readBridge = (): ElectronBridge | null => {
  if (typeof window === "undefined") return null;
  const w = window as typeof window & { electronAPI?: ElectronBridge };
  return w.electronAPI || null;
};

const loadCurrentAnimalGenetics = async (animalId: string): Promise<GeneticsSnapshot | null> => {
  const bridge = readBridge();

  if (bridge?.loadData) {
    const payload = await bridge.loadData();
    const snakes = Array.isArray(payload?.snakes) ? payload?.snakes : [];
    const snake = snakes.find(
      (entry) => entry && typeof entry === "object" && String((entry as Record<string, unknown>).id ?? "") === animalId
    ) as SnakeRecord | undefined;
    if (!snake) return null;
    return {
      morphs: normalizeStringArray(snake.morphs),
      hets: normalizeStringArray(snake.hets),
      possibleHets: normalizeStringArray(snake.possibleHets),
    };
  }

  if (typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem("breedingPlannerSnakes");
      const parsed = raw ? JSON.parse(raw) : [];
      const snakes = Array.isArray(parsed) ? parsed : [];
      const snake = snakes.find((entry) => String(entry?.id ?? "") === animalId) as SnakeRecord | undefined;
      if (!snake) return null;
      return {
        morphs: normalizeStringArray(snake.morphs),
        hets: normalizeStringArray(snake.hets),
        possibleHets: normalizeStringArray(snake.possibleHets),
      };
    } catch {
      return null;
    }
  }

  return null;
};

const findLatestFinalizedResult = (order: TestOrder, testCode?: string): TestResult | null => {
  const normalizedCode = String(testCode ?? "").trim().toLowerCase();
  const candidates = listTestResultRecordsByOrderId(order.id).filter((row) => {
    if (!FINAL_RESULT_STATUSES.has(row.status)) return false;
    if (!normalizedCode) return true;
    return String(row.testCode || "").trim().toLowerCase() === normalizedCode;
  });
  return candidates[0] || null;
};

const buildResultHistory = (order: TestOrder) => {
  const rows = listTestResultRecordsByOrderId(order.id).filter((row) => FINAL_RESULT_STATUSES.has(row.status));
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    testCode: row.testCode,
    summary: row.summary,
    findings: row.findings,
    reportedAt: row.reportedAt,
    reviewedAt: row.reviewedAt,
    releasedAt: row.releasedAt,
    certificateId: row.certificateId,
  }));
};

const findExistingAppliedGeneticsForResult = (animalId: string, resultId: string): GeneticsUpdateEngineResult | null => {
  const timeline = listLabRecordsByAnimal(animalId);
  const matching = (timeline.geneticsChanges || []).find(
    (entry) => entry.source === "labResult" && entry.resultId === resultId
  );
  if (!matching) return null;

  return {
    applied: matching.status === "applied" || matching.status === "approved",
    changedGeneKeys: [],
    before: matching.before,
    after: matching.after,
    changeLogId: matching.id,
    reason: matching.reason || "Genetics already finalized for this result.",
  };
};

export const finalizeResultForOrder = async (
  actor: ServiceActor,
  order: TestOrder,
  result: TestResult
): Promise<GeneticsUpdateEngineResult> => {
  const existing = findExistingAppliedGeneticsForResult(order.animalId, result.id);
  if (existing) {
    return {
      ...existing,
      reason: "Finalization already applied for this result.",
    };
  }

  return applyConfirmedResultGeneticsUpdate({ actor, order, result });
};

export const finalizeLatestOrderResult = async (
  actor: ServiceActor,
  order: TestOrder,
  options: { testCode?: string; allowNoop?: boolean } = {}
): Promise<{
  result: TestResult | null;
  geneticsUpdate: GeneticsUpdateEngineResult;
  certificate: {
    id: string;
    certificateNumber: string;
    issuedAt?: string;
    fileUrl?: string;
    verificationCode?: string;
  } | null;
}> => {
  if (!FINALIZABLE_ORDER_STATUSES.has(order.status)) {
    return {
      result: null,
      geneticsUpdate: {
        applied: false,
        changedGeneKeys: [],
        before: { morphs: [], hets: [] },
        after: { morphs: [], hets: [] },
        reason: `Order status '${order.status}' is not eligible for genetics finalization.`,
      },
      certificate: null,
    };
  }

  const candidate = findLatestFinalizedResult(order, options.testCode);
  if (!candidate) {
    if (options.allowNoop) {
      return {
        result: null,
        geneticsUpdate: {
          applied: false,
          changedGeneKeys: [],
          before: { morphs: [], hets: [] },
          after: { morphs: [], hets: [] },
          reason: "No finalized result record found for this order.",
        },
        certificate: null,
      };
    }
    throw new Error("No finalized result record found for this order.");
  }

  const geneticsUpdate = await finalizeResultForOrder(actor, order, candidate);
  const createdOrExistingCertificate = await issueCertificateForCompletedOrder(actor, order, candidate);

  void emitShedWorkflowEvent({
    type: "result_finalized",
    orderId: order.id,
    labId: order.labId,
    animalId: order.animalId,
    actor: { userId: actor.userId, role: actor.role },
    metadata: {
      resultId: candidate.id,
      resultStatus: candidate.status,
      testCode: candidate.testCode,
      geneticsApplied: geneticsUpdate.applied,
      geneticsChangeLogId: geneticsUpdate.changeLogId,
      certificateId: createdOrExistingCertificate?.id,
    },
  });

  let verificationCode: string | undefined;
  if (createdOrExistingCertificate?.notes) {
    try {
      const parsed = JSON.parse(createdOrExistingCertificate.notes) as { verificationCode?: string };
      verificationCode = typeof parsed?.verificationCode === "string" ? parsed.verificationCode : undefined;
    } catch {
      verificationCode = undefined;
    }
  }

  return {
    result: candidate,
    geneticsUpdate,
    certificate: createdOrExistingCertificate
      ? {
          id: createdOrExistingCertificate.id,
          certificateNumber: createdOrExistingCertificate.certificateNumber,
          issuedAt: createdOrExistingCertificate.issuedAt,
          fileUrl: createdOrExistingCertificate.fileUrl,
          verificationCode,
        }
      : null,
  };
};

export const getBreederOrderOutcomeSummary = async (actor: ServiceActor, orderId: string) => {
  const normalizedOrderId = String(orderId || "").trim();
  if (!normalizedOrderId) {
    throw new Error("Invalid orderId.");
  }

  const order = getTestOrderRecordById(normalizedOrderId);
  if (!order) {
    throw new Error("Test order not found.");
  }
  if (!canAccessOrder(actor, order)) {
    throw new Error("Access denied: you do not have permission to access this test order.");
  }

  const latestResult = findLatestFinalizedResult(order);
  const appliedChange = latestResult
    ? findExistingAppliedGeneticsForResult(order.animalId, latestResult.id)
    : null;

  const linkedCertificate = order.certificateId
    ? getCertificateRecordById(order.certificateId)
    : listCertificateRecordsByOrderId(order.id)[0] || null;

  let certificateVerificationCode: string | undefined;
  if (linkedCertificate?.notes) {
    try {
      const parsed = JSON.parse(linkedCertificate.notes) as { verificationCode?: string };
      certificateVerificationCode = typeof parsed?.verificationCode === "string" ? parsed.verificationCode : undefined;
    } catch {
      certificateVerificationCode = undefined;
    }
  }

  const currentGenetics = await loadCurrentAnimalGenetics(order.animalId);
  const resultHistory = buildResultHistory(order);

  const labConfirmedMarkers = resultHistory
    .flatMap((row) => row.findings || [])
    .filter((finding) => LAB_CONFIRMED_OUTCOMES.has(String(finding.outcome || "")))
    .map((finding) => ({
      marker: finding.marker,
      outcome: finding.outcome,
    }));

  return {
    order,
    latestResult: latestResult
      ? {
          id: latestResult.id,
          status: latestResult.status,
          testCode: latestResult.testCode,
          summary: latestResult.summary,
          findings: latestResult.findings,
          reportedAt: latestResult.reportedAt,
          reviewedAt: latestResult.reviewedAt,
          releasedAt: latestResult.releasedAt,
        }
      : null,
    geneticsUpdate: appliedChange
      ? {
          applied: appliedChange.applied,
          changeLogId: appliedChange.changeLogId,
          reason: appliedChange.reason,
          before: appliedChange.before,
          after: appliedChange.after,
        }
      : null,
    certificate: linkedCertificate
      ? {
          id: linkedCertificate.id,
          status: linkedCertificate.status,
          certificateNumber: linkedCertificate.certificateNumber,
          issuedAt: linkedCertificate.issuedAt,
          fileUrl: linkedCertificate.fileUrl,
          verificationCode: certificateVerificationCode,
        }
      : null,
    resultHistory,
    labConfirmedMarkers,
    currentGenetics,
  };
};
