declare const require: any;

import type {
  Certificate,
  GeneticsChangeLog,
  Payment,
  Sample,
  StatusHistory,
  TestOrder,
  TestResult,
} from "../types/lab";
import type { PendingShedTestItem, ShedSubmissionBatch } from "../types/labShedTerminal";
import type {
  CertificateStatus,
  OrderPaymentStatus,
  PaymentStatus,
  SampleStatus,
  TestOrderStatus,
} from "../types/labStatus";
import type { LabAvailableTest, CreateLabAvailableTestInput, UpdateLabAvailableTestInput } from "../types/labTestCatalog";
import { DEFAULT_CATALOG_LAB_ID, LAB_TEST_CATALOG_SEEDS } from "../data/testCatalog";
import type { CatalogCategory, PricingType } from "../types/labPricing";

const isBrowser = typeof window !== "undefined" && typeof window.document !== "undefined";

const nowIso = (): string => new Date().toISOString();

const safeStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return "null";
  }
};

const safeParse = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

type ActorContext = {
  userId?: string;
  role?: string;
};

type StatusChangeInput = {
  id?: string;
  labId: string;
  entityType: StatusHistory["entityType"];
  entityId: string;
  fromStatus?: string;
  toStatus: string;
  changedAt?: string;
  reason?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
  actor?: ActorContext;
};

type CreateTestOrderInput = Omit<TestOrder, "createdAt" | "updatedAt">;
type CreateSampleInput = Omit<Sample, "createdAt" | "updatedAt">;
type CreateTestResultInput = Omit<TestResult, "createdAt" | "updatedAt">;
type CreateCertificateInput = Omit<Certificate, "createdAt" | "updatedAt">;
type CreatePaymentInput = Omit<Payment, "createdAt" | "updatedAt">;
type CreateGeneticsChangeInput = Omit<GeneticsChangeLog, "createdAt" | "updatedAt">;
type CreateAvailableTestStoreInput = Omit<LabAvailableTest, "id" | "createdAt" | "updatedAt">;
type CreatePendingShedTestStoreInput = Omit<PendingShedTestItem, "createdAt" | "updatedAt">;
type CreateShedSubmissionBatchStoreInput = Omit<ShedSubmissionBatch, "createdAt" | "updatedAt">;

const DEFAULT_LAB_ID = DEFAULT_CATALOG_LAB_ID;
const SYSTEM_CATALOG_USER_ID = "system";

const inferPricingType = (
  pricingType: PricingType | undefined,
  category: CatalogCategory | undefined
): PricingType => {
  if (pricingType === "morph" || pricingType === "sex") return pricingType;
  return category === "sex-determination" ? "sex" : "morph";
};

const buildDefaultCatalogRecords = (): CreateAvailableTestStoreInput[] => {
  return LAB_TEST_CATALOG_SEEDS.map((seed, index) => {
    const pricingType = inferPricingType(seed.pricingType, seed.category);
    return {
      labId: DEFAULT_LAB_ID,
      internalCode: seed.internalCode,
      name: seed.name,
      shortLabel: seed.shortLabel,
      description: seed.description,
      geneTarget: seed.geneTarget,
      category: seed.category,
      pricingType,
      priceCents: 0,
      currency: seed.currency,
      allowedPriorities: seed.allowedPriorities,
      isActive: seed.active,
      isVisibleToBreeder: seed.isVisibleToBreeder,
      sortOrder: seed.sortOrder ?? index,
      archivedAt: undefined,
      createdByUserId: "system",
      updatedByUserId: "system",
    };
  });
};

const normalizeCatalogLookupKey = (value: unknown): string =>
  String(value || "").trim().toLowerCase();

const isSystemSeededCatalogRow = (row: Partial<LabAvailableTest> | null | undefined): boolean =>
  String(row?.labId || "").trim() === DEFAULT_LAB_ID &&
  normalizeCatalogLookupKey(row?.createdByUserId || SYSTEM_CATALOG_USER_ID) === SYSTEM_CATALOG_USER_ID;

const syncCatalogRecordWithDefault = (
  row: LabAvailableTest,
  defaultsByCode: Map<string, CreateAvailableTestStoreInput>,
  defaultsByName: Map<string, CreateAvailableTestStoreInput>
): boolean => {
  const matchingDefault =
    defaultsByCode.get(normalizeCatalogLookupKey(row.internalCode)) ||
    defaultsByName.get(normalizeCatalogLookupKey(row.name));

  if (!matchingDefault) return false;

  let changed = false;
  const nextPricingType = inferPricingType(matchingDefault.pricingType, matchingDefault.category);

  if (row.internalCode !== matchingDefault.internalCode) {
    row.internalCode = matchingDefault.internalCode;
    changed = true;
  }
  if (row.name !== matchingDefault.name) {
    row.name = matchingDefault.name;
    changed = true;
  }
  if ((row.shortLabel || "") !== (matchingDefault.shortLabel || "")) {
    row.shortLabel = matchingDefault.shortLabel;
    changed = true;
  }
  if ((row.description || "") !== (matchingDefault.description || "")) {
    row.description = matchingDefault.description;
    changed = true;
  }
  if ((row.geneTarget || "") !== (matchingDefault.geneTarget || "")) {
    row.geneTarget = matchingDefault.geneTarget;
    changed = true;
  }
  if ((row.category || "") !== (matchingDefault.category || "")) {
    row.category = matchingDefault.category;
    changed = true;
  }
  if (row.pricingType !== nextPricingType) {
    row.pricingType = nextPricingType;
    changed = true;
  }
  if (row.currency !== matchingDefault.currency) {
    row.currency = matchingDefault.currency;
    changed = true;
  }
  if (row.archivedAt) {
    row.archivedAt = undefined;
    changed = true;
  }

  return changed;
};

export interface LabStore {
  createTestOrder(input: CreateTestOrderInput, actor?: ActorContext): TestOrder;
  getTestOrderById(orderId: string): TestOrder | null;
  listTestOrdersByBreederUserId(breederUserId: string): TestOrder[];
  listTestOrdersByLabId(labId: string): TestOrder[];
  listAllTestOrders(): TestOrder[];
  updateTestOrderStatus(orderId: string, status: TestOrderStatus, actor?: ActorContext, reason?: string): TestOrder | null;
  updateTestOrderPaymentStatus(
    orderId: string,
    paymentStatus: OrderPaymentStatus,
    actor?: ActorContext,
    reason?: string
  ): TestOrder | null;

  createSample(input: CreateSampleInput, actor?: ActorContext): Sample;
  getSampleById(sampleId: string): Sample | null;
  updateSampleStatus(sampleId: string, status: SampleStatus, actor?: ActorContext, reason?: string): Sample | null;
  lookupSampleByQrToken(qrToken: string): Sample | null;

  createTestResult(input: CreateTestResultInput, actor?: ActorContext): TestResult;
  listTestResultsByOrderId(orderId: string): TestResult[];
  updateTestResultCertificateId(resultId: string, certificateId: string, actor?: ActorContext, reason?: string): TestResult | null;

  createCertificate(input: CreateCertificateInput, actor?: ActorContext): Certificate;
  getCertificateById(certificateId: string): Certificate | null;
  listCertificatesByOrderId(orderId: string): Certificate[];
  updateCertificateStatus(certificateId: string, status: CertificateStatus, actor?: ActorContext, reason?: string): Certificate | null;

  updateTestOrderCertificateId(orderId: string, certificateId: string, actor?: ActorContext, reason?: string): TestOrder | null;

  createPayment(input: CreatePaymentInput, actor?: ActorContext): Payment;
  updatePaymentStatus(paymentId: string, status: PaymentStatus, actor?: ActorContext, reason?: string): Payment | null;

  createGeneticsChangeLog(input: CreateGeneticsChangeInput, actor?: ActorContext): GeneticsChangeLog;
  applyApprovedGeneticsChange(changeId: string, actor?: ActorContext, reason?: string): GeneticsChangeLog | null;
  listGeneticsChangesByOrderId(orderId: string): GeneticsChangeLog[];

  addStatusHistory(input: StatusChangeInput): StatusHistory;

  listStatusHistory(entityType: StatusHistory["entityType"], entityId: string): StatusHistory[];

  createAvailableTest(input: CreateAvailableTestStoreInput, actor?: ActorContext): LabAvailableTest;
  getAvailableTestById(id: string): LabAvailableTest | null;
  listAvailableTestsByLabId(labId: string): LabAvailableTest[];
  listBreederVisibleTests(): LabAvailableTest[];
  updateAvailableTest(input: UpdateLabAvailableTestInput, actor?: ActorContext): LabAvailableTest;
  setAvailableTestActive(id: string, isActive: boolean, actor?: ActorContext): LabAvailableTest | null;
  setAvailableTestVisibility(id: string, isVisibleToBreeder: boolean, actor?: ActorContext): LabAvailableTest | null;

  createPendingShedTest(input: CreatePendingShedTestStoreInput, actor?: ActorContext): PendingShedTestItem;
  getPendingShedTestById(id: string): PendingShedTestItem | null;
  updatePendingShedTest(
    id: string,
    patch: Partial<Pick<PendingShedTestItem, "selectedTestIds" | "selectedTestNames" | "priority" | "sampleType" | "notes" | "selected">>,
    actor?: ActorContext
  ): PendingShedTestItem | null;
  deletePendingShedTest(id: string, actor?: ActorContext): boolean;
  listPendingShedTestsByBreederUserId(breederUserId: string): PendingShedTestItem[];

  createShedSubmissionBatch(input: CreateShedSubmissionBatchStoreInput, actor?: ActorContext): ShedSubmissionBatch;
  getShedSubmissionBatchById(id: string): ShedSubmissionBatch | null;
  listShedSubmissionBatchesByBreederUserId(breederUserId: string): ShedSubmissionBatch[];

  listByAnimal(animalId: string): {
    testOrders: TestOrder[];
    samples: Sample[];
    testResults: TestResult[];
    certificates: Certificate[];
    payments: Payment[];
    geneticsChanges: GeneticsChangeLog[];
  };
}

const makeId = (prefix: string): string => {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${random}`;
};

const toRecordWithAudit = <T extends object>(value: T): T & { createdAt: string; updatedAt: string } => {
  const createdAt = nowIso();
  return { ...value, createdAt, updatedAt: createdAt };
};

const ensureDefaultCatalogInMemory = (state: { availableTests: LabAvailableTest[] }): boolean => {
  const defaults = buildDefaultCatalogRecords();
  const defaultsByCode = new Map(defaults.map((entry) => [normalizeCatalogLookupKey(entry.internalCode), entry]));
  const defaultsByName = new Map(defaults.map((entry) => [normalizeCatalogLookupKey(entry.name), entry]));
  const existingKeys = new Set<string>();
  let changed = false;

  state.availableTests.forEach((row) => {
    if (!isSystemSeededCatalogRow(row)) return;

    if (syncCatalogRecordWithDefault(row, defaultsByCode, defaultsByName)) {
      row.updatedAt = nowIso();
      row.updatedByUserId = SYSTEM_CATALOG_USER_ID;
      changed = true;
    }

    const matchingDefault =
      defaultsByCode.get(normalizeCatalogLookupKey(row.internalCode)) ||
      defaultsByName.get(normalizeCatalogLookupKey(row.name));

    if (matchingDefault) {
      existingKeys.add(normalizeCatalogLookupKey(matchingDefault.internalCode));
      existingKeys.add(normalizeCatalogLookupKey(matchingDefault.name));
      return;
    }

    if (!row.archivedAt) {
      const archivedAt = nowIso();
      row.archivedAt = archivedAt;
      row.updatedAt = archivedAt;
      row.updatedByUserId = SYSTEM_CATALOG_USER_ID;
      changed = true;
    }
  });

  defaults.forEach((entry) => {
    const codeKey = normalizeCatalogLookupKey(entry.internalCode);
    const nameKey = normalizeCatalogLookupKey(entry.name);
    if (!codeKey || existingKeys.has(codeKey) || existingKeys.has(nameKey)) return;
    state.availableTests.push(toRecordWithAudit({ ...entry, id: makeId("avtest") }));
    existingKeys.add(codeKey);
    existingKeys.add(nameKey);
    changed = true;
  });
  return changed;
};

const normalizeCatalogPricingTypeInMemory = (state: { availableTests: LabAvailableTest[] }): boolean => {
  let changed = false;
  state.availableTests.forEach((row) => {
    const inferred = inferPricingType(row.pricingType, row.category);
    if (row.pricingType !== inferred) {
      row.pricingType = inferred;
      changed = true;
    }
  });
  return changed;
};

const sqlSchema = `
CREATE TABLE IF NOT EXISTS test_orders (
  id TEXT PRIMARY KEY,
  lab_id TEXT NOT NULL,
  animal_id TEXT NOT NULL,
  order_number TEXT NOT NULL,
  status TEXT NOT NULL,
  requested_tests_json TEXT NOT NULL,
  pricing_snapshot_json TEXT,
  priority TEXT NOT NULL,
  breeder_user_id TEXT,
  requested_by_user_id TEXT,
  submitted_at TEXT,
  sample_ids_json TEXT NOT NULL,
  result_ids_json TEXT NOT NULL,
  certificate_id TEXT,
  payment_id TEXT,
  payment_status TEXT NOT NULL DEFAULT 'pending',
  external_reference TEXT,
  notes TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS samples (
  id TEXT PRIMARY KEY,
  lab_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  animal_id TEXT NOT NULL,
  status TEXT NOT NULL,
  type TEXT NOT NULL,
  accession_number TEXT,
  collected_at TEXT,
  received_at TEXT,
  accepted_at TEXT,
  rejected_at TEXT,
  quality TEXT,
  storage_location TEXT,
  tracking_code TEXT,
  qr_token TEXT NOT NULL DEFAULT '',
  collector_user_id TEXT,
  rejection_reason TEXT,
  notes TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS test_results (
  id TEXT PRIMARY KEY,
  lab_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  sample_id TEXT NOT NULL,
  animal_id TEXT NOT NULL,
  status TEXT NOT NULL,
  test_code TEXT NOT NULL,
  method TEXT,
  findings_json TEXT NOT NULL,
  summary TEXT,
  reported_at TEXT,
  reviewed_at TEXT,
  released_at TEXT,
  analyst_user_id TEXT,
  reviewer_user_id TEXT,
  certificate_id TEXT,
  notes TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS certificates (
  id TEXT PRIMARY KEY,
  lab_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  animal_id TEXT NOT NULL,
  status TEXT NOT NULL,
  certificate_number TEXT NOT NULL,
  result_ids_json TEXT NOT NULL,
  issued_at TEXT,
  expires_at TEXT,
  file_url TEXT,
  signature_digest TEXT,
  issued_by_user_id TEXT,
  notes TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  lab_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  animal_id TEXT,
  status TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  method TEXT NOT NULL,
  provider TEXT,
  external_transaction_id TEXT,
  paid_at TEXT,
  failed_at TEXT,
  refunded_at TEXT,
  notes TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS status_history (
  id TEXT PRIMARY KEY,
  lab_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  changed_by_user_id TEXT,
  changed_by_role TEXT,
  reason TEXT,
  notes TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS genetics_change_log (
  id TEXT PRIMARY KEY,
  lab_id TEXT NOT NULL,
  animal_id TEXT NOT NULL,
  status TEXT NOT NULL,
  source TEXT NOT NULL,
  change_type TEXT NOT NULL,
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  order_id TEXT,
  result_id TEXT,
  changed_at TEXT NOT NULL,
  changed_by_user_id TEXT,
  reviewer_user_id TEXT,
  reviewed_at TEXT,
  reason TEXT,
  notes TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_test_orders_animal_id ON test_orders(animal_id);
CREATE INDEX IF NOT EXISTS idx_test_orders_status ON test_orders(status);
CREATE INDEX IF NOT EXISTS idx_test_orders_requested_by_user_id ON test_orders(requested_by_user_id);

CREATE INDEX IF NOT EXISTS idx_samples_order_id ON samples(order_id);
CREATE INDEX IF NOT EXISTS idx_samples_animal_id ON samples(animal_id);
CREATE INDEX IF NOT EXISTS idx_samples_status ON samples(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_samples_qr_token ON samples(qr_token) WHERE qr_token != '';

CREATE INDEX IF NOT EXISTS idx_test_results_order_id ON test_results(order_id);
CREATE INDEX IF NOT EXISTS idx_test_results_sample_id ON test_results(sample_id);
CREATE INDEX IF NOT EXISTS idx_test_results_animal_id ON test_results(animal_id);
CREATE INDEX IF NOT EXISTS idx_test_results_status ON test_results(status);

CREATE INDEX IF NOT EXISTS idx_certificates_order_id ON certificates(order_id);
CREATE INDEX IF NOT EXISTS idx_certificates_animal_id ON certificates(animal_id);
CREATE INDEX IF NOT EXISTS idx_certificates_status ON certificates(status);

CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_animal_id ON payments(animal_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

CREATE INDEX IF NOT EXISTS idx_status_history_entity ON status_history(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_status_history_changed_by_user_id ON status_history(changed_by_user_id);

CREATE INDEX IF NOT EXISTS idx_genetics_change_log_animal_id ON genetics_change_log(animal_id);
CREATE INDEX IF NOT EXISTS idx_genetics_change_log_order_id ON genetics_change_log(order_id);
CREATE INDEX IF NOT EXISTS idx_genetics_change_log_result_id ON genetics_change_log(result_id);
CREATE INDEX IF NOT EXISTS idx_genetics_change_log_status ON genetics_change_log(status);

CREATE TABLE IF NOT EXISTS available_tests (
  id TEXT PRIMARY KEY,
  lab_id TEXT NOT NULL,
  internal_code TEXT NOT NULL,
  name TEXT NOT NULL,
  short_label TEXT,
  description TEXT,
  gene_target TEXT,
  category TEXT,
  pricing_type TEXT NOT NULL DEFAULT 'morph',
  price_cents INTEGER,
  currency TEXT NOT NULL DEFAULT 'USD',
  allowed_priorities_json TEXT NOT NULL DEFAULT '["routine","priority","urgent"]',
  is_active INTEGER NOT NULL DEFAULT 1,
  is_visible_to_breeder INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pending_shed_tests (
  id TEXT PRIMARY KEY,
  breeder_user_id TEXT NOT NULL,
  lab_id TEXT NOT NULL,
  snake_id TEXT NOT NULL,
  snake_display_id TEXT,
  snake_name TEXT,
  selected_test_ids_json TEXT NOT NULL,
  selected_test_names_json TEXT,
  priority TEXT NOT NULL,
  sample_type TEXT NOT NULL,
  notes TEXT,
  selected INTEGER NOT NULL DEFAULT 1,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shed_submission_batches (
  id TEXT PRIMARY KEY,
  breeder_user_id TEXT NOT NULL,
  lab_id TEXT NOT NULL,
  pending_item_ids_json TEXT NOT NULL,
  order_ids_json TEXT NOT NULL,
  item_count INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_available_tests_lab_id ON available_tests(lab_id);
CREATE INDEX IF NOT EXISTS idx_available_tests_is_active ON available_tests(is_active);
CREATE INDEX IF NOT EXISTS idx_available_tests_sort_order ON available_tests(lab_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_pending_shed_tests_breeder_user_id ON pending_shed_tests(breeder_user_id);
CREATE INDEX IF NOT EXISTS idx_pending_shed_tests_lab_id ON pending_shed_tests(lab_id);
CREATE INDEX IF NOT EXISTS idx_pending_shed_tests_snake_id ON pending_shed_tests(snake_id);
CREATE INDEX IF NOT EXISTS idx_pending_shed_tests_updated_at ON pending_shed_tests(updated_at);

CREATE INDEX IF NOT EXISTS idx_shed_submission_batches_breeder_user_id ON shed_submission_batches(breeder_user_id);
CREATE INDEX IF NOT EXISTS idx_shed_submission_batches_lab_id ON shed_submission_batches(lab_id);
CREATE INDEX IF NOT EXISTS idx_shed_submission_batches_submitted_at ON shed_submission_batches(submitted_at);
`;

type MemoryState = {
  testOrders: TestOrder[];
  samples: Sample[];
  testResults: TestResult[];
  certificates: Certificate[];
  payments: Payment[];
  statusHistory: StatusHistory[];
  geneticsChanges: GeneticsChangeLog[];
  availableTests: LabAvailableTest[];
  pendingShedTests: PendingShedTestItem[];
  shedSubmissionBatches: ShedSubmissionBatch[];
};

const LAB_MEMORY_STORE_KEY = "breedingPlannerLabMemoryStore";

const emptyMemoryState = (): MemoryState => ({
  testOrders: [],
  samples: [],
  testResults: [],
  certificates: [],
  payments: [],
  statusHistory: [],
  geneticsChanges: [],
  availableTests: [],
  pendingShedTests: [],
  shedSubmissionBatches: [],
});

const loadMemoryState = (): MemoryState => {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return emptyMemoryState();
  }

  try {
    const raw = localStorage.getItem(LAB_MEMORY_STORE_KEY);
    if (!raw) return emptyMemoryState();
    const parsed = JSON.parse(raw) as Partial<MemoryState>;
    return {
      testOrders: Array.isArray(parsed?.testOrders) ? parsed.testOrders : [],
      samples: Array.isArray(parsed?.samples) ? parsed.samples : [],
      testResults: Array.isArray(parsed?.testResults) ? parsed.testResults : [],
      certificates: Array.isArray(parsed?.certificates) ? parsed.certificates : [],
      payments: Array.isArray(parsed?.payments) ? parsed.payments : [],
      statusHistory: Array.isArray(parsed?.statusHistory) ? parsed.statusHistory : [],
      geneticsChanges: Array.isArray(parsed?.geneticsChanges) ? parsed.geneticsChanges : [],
      availableTests: Array.isArray(parsed?.availableTests) ? parsed.availableTests : [],
      pendingShedTests: Array.isArray(parsed?.pendingShedTests) ? parsed.pendingShedTests : [],
      shedSubmissionBatches: Array.isArray(parsed?.shedSubmissionBatches) ? parsed.shedSubmissionBatches : [],
    };
  } catch {
    return emptyMemoryState();
  }
};

const createMemoryLabStore = (): LabStore => {
  const state: MemoryState = loadMemoryState();

  const persistState = (): void => {
    if (typeof window === "undefined" || typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(LAB_MEMORY_STORE_KEY, JSON.stringify(state));
    } catch {
      // ignore persistence errors (e.g. quota exceeded/private mode)
    }
  };

  if (ensureDefaultCatalogInMemory(state) || normalizeCatalogPricingTypeInMemory(state)) {
    persistState();
  }

  const addStatusHistory = (input: StatusChangeInput): StatusHistory => {
    const createdAt = nowIso();
    const item: StatusHistory = {
      id: input.id || makeId("status"),
      labId: input.labId,
      entityType: input.entityType,
      entityId: input.entityId,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      changedAt: input.changedAt || createdAt,
      changedByUserId: input.actor?.userId,
      reason: input.reason,
      notes: input.notes,
      metadata: input.metadata,
      createdAt,
      updatedAt: createdAt,
    };
    state.statusHistory.push(item);
    persistState();
    return item;
  };

  return {
    createTestOrder(input, actor) {
      const created = toRecordWithAudit({
        ...input,
        paymentStatus: input.paymentStatus || "pending",
      });
      state.testOrders.push(created);
      addStatusHistory({
        labId: created.labId,
        entityType: "testOrder",
        entityId: created.id,
        toStatus: created.status,
        reason: "order_created",
        actor,
      });
      persistState();
      return created;
    },
    getTestOrderById(orderId) {
      return state.testOrders.find((row) => row.id === orderId) || null;
    },
    listTestOrdersByBreederUserId(breederUserId) {
      return state.testOrders
        .filter((row) => row.requestedByUserId === breederUserId || row.breederUserId === breederUserId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    listTestOrdersByLabId(labId) {
      return state.testOrders
        .filter((row) => row.labId === labId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    listAllTestOrders() {
      return [...state.testOrders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    updateTestOrderStatus(orderId, status, actor, reason) {
      const current = state.testOrders.find((row) => row.id === orderId) || null;
      if (!current) return null;
      const previous = current.status;
      current.status = status;
      current.updatedAt = nowIso();
      addStatusHistory({
        labId: current.labId,
        entityType: "testOrder",
        entityId: current.id,
        fromStatus: previous,
        toStatus: status,
        actor,
        reason,
      });
      persistState();
      return current;
    },
    updateTestOrderPaymentStatus(orderId, paymentStatus, actor, reason) {
      const current = state.testOrders.find((row) => row.id === orderId) || null;
      if (!current) return null;
      current.paymentStatus = paymentStatus;
      current.updatedAt = nowIso();
      addStatusHistory({
        labId: current.labId,
        entityType: "testOrder",
        entityId: current.id,
        fromStatus: current.status,
        toStatus: current.status,
        actor,
        reason: reason || "test_order_payment_updated",
        metadata: { paymentStatus },
      });
      persistState();
      return current;
    },
    createSample(input, actor) {
      const created = toRecordWithAudit(input);
      state.samples.push(created);
      addStatusHistory({
        labId: created.labId,
        entityType: "sample",
        entityId: created.id,
        toStatus: created.status,
        reason: "sample_created",
        actor,
      });
      persistState();
      return created;
    },
    getSampleById(sampleId) {
      return state.samples.find((row) => row.id === sampleId) || null;
    },
    lookupSampleByQrToken(qrToken) {
      return state.samples.find((row) => row.qrToken === qrToken) || null;
    },
    updateSampleStatus(sampleId, status, actor, reason) {
      const current = state.samples.find((row) => row.id === sampleId) || null;
      if (!current) return null;
      const previous = current.status;
      current.status = status;
      current.updatedAt = nowIso();
      if (status === "sample_received" && !current.receivedAt) {
        current.receivedAt = current.updatedAt;
      }
      addStatusHistory({
        labId: current.labId,
        entityType: "sample",
        entityId: current.id,
        fromStatus: previous,
        toStatus: status,
        actor,
        reason,
      });
      persistState();
      return current;
    },
    createTestResult(input, actor) {
      const created = toRecordWithAudit(input);
      state.testResults.push(created);

      const linkedOrder = state.testOrders.find((row) => row.id === created.orderId) || null;
      if (linkedOrder) {
        const nextResultIds = Array.isArray(linkedOrder.resultIds) ? [...linkedOrder.resultIds] : [];
        if (!nextResultIds.includes(created.id)) {
          linkedOrder.resultIds = [...nextResultIds, created.id];
          linkedOrder.updatedAt = nowIso();
        }
      }

      addStatusHistory({
        labId: created.labId,
        entityType: "testResult",
        entityId: created.id,
        toStatus: created.status,
        reason: "test_result_created",
        actor,
      });
      persistState();
      return created;
    },
    listTestResultsByOrderId(orderId) {
      return state.testResults
        .filter((row) => row.orderId === orderId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    updateTestResultCertificateId(resultId, certificateId, actor, reason) {
      const current = state.testResults.find((row) => row.id === resultId) || null;
      if (!current) return null;
      current.certificateId = certificateId;
      current.updatedAt = nowIso();
      addStatusHistory({
        labId: current.labId,
        entityType: "testResult",
        entityId: current.id,
        fromStatus: current.status,
        toStatus: current.status,
        actor,
        reason: reason || "test_result_certificate_linked",
        metadata: { certificateId },
      });
      persistState();
      return current;
    },
    createCertificate(input, actor) {
      const created = toRecordWithAudit(input);
      state.certificates.push(created);
      addStatusHistory({
        labId: created.labId,
        entityType: "certificate",
        entityId: created.id,
        toStatus: created.status,
        reason: "certificate_created",
        actor,
      });
      persistState();
      return created;
    },
    getCertificateById(certificateId) {
      return state.certificates.find((row) => row.id === certificateId) || null;
    },
    listCertificatesByOrderId(orderId) {
      return state.certificates
        .filter((row) => row.orderId === orderId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    updateCertificateStatus(certificateId, status, actor, reason) {
      const current = state.certificates.find((row) => row.id === certificateId) || null;
      if (!current) return null;
      const previous = current.status;
      current.status = status;
      current.updatedAt = nowIso();
      addStatusHistory({
        labId: current.labId,
        entityType: "certificate",
        entityId: current.id,
        fromStatus: previous,
        toStatus: status,
        actor,
        reason,
      });
      persistState();
      return current;
    },
    updateTestOrderCertificateId(orderId, certificateId, actor, reason) {
      const current = state.testOrders.find((row) => row.id === orderId) || null;
      if (!current) return null;
      current.certificateId = certificateId;
      current.updatedAt = nowIso();
      addStatusHistory({
        labId: current.labId,
        entityType: "testOrder",
        entityId: current.id,
        fromStatus: current.status,
        toStatus: current.status,
        actor,
        reason: reason || "test_order_certificate_linked",
        metadata: { certificateId },
      });
      persistState();
      return current;
    },
    createPayment(input, actor) {
      const created = toRecordWithAudit(input);
      state.payments.push(created);
      addStatusHistory({
        labId: created.labId,
        entityType: "payment",
        entityId: created.id,
        toStatus: created.status,
        reason: "payment_created",
        actor,
      });
      persistState();
      return created;
    },
    updatePaymentStatus(paymentId, status, actor, reason) {
      const current = state.payments.find((row) => row.id === paymentId) || null;
      if (!current) return null;
      const previous = current.status;
      current.status = status;
      current.updatedAt = nowIso();
      addStatusHistory({
        labId: current.labId,
        entityType: "payment",
        entityId: current.id,
        fromStatus: previous,
        toStatus: status,
        actor,
        reason,
      });
      persistState();
      return current;
    },
    createGeneticsChangeLog(input, actor) {
      const created = toRecordWithAudit(input);
      state.geneticsChanges.push(created);
      addStatusHistory({
        labId: created.labId,
        entityType: "geneticsChangeLog",
        entityId: created.id,
        toStatus: created.status,
        reason: "genetics_change_logged",
        actor,
      });
      persistState();
      return created;
    },
    applyApprovedGeneticsChange(changeId, actor, reason) {
      const current = state.geneticsChanges.find((row) => row.id === changeId) || null;
      if (!current) return null;
      if (current.status !== "approved") {
        throw new Error("Genetics change must be approved before apply.");
      }
      const previous = current.status;
      current.status = "applied";
      current.reviewedAt = nowIso();
      current.updatedAt = nowIso();
      addStatusHistory({
        labId: current.labId,
        entityType: "geneticsChangeLog",
        entityId: current.id,
        fromStatus: previous,
        toStatus: current.status,
        actor,
        reason: reason || "genetics_change_applied",
      });
      persistState();
      return current;
    },
    listGeneticsChangesByOrderId(orderId) {
      return state.geneticsChanges
        .filter((row) => row.orderId === orderId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    addStatusHistory,
    listStatusHistory(entityType, entityId) {
      return state.statusHistory
        .filter((row) => row.entityType === entityType && row.entityId === entityId)
        .sort((a, b) => a.changedAt.localeCompare(b.changedAt));
    },
    createAvailableTest(input, actor) {
      const createdAt = nowIso();
      const id = makeId("avtest");
      const pricingType = inferPricingType(input.pricingType, input.category);
      const record: LabAvailableTest = {
        ...input,
        pricingType,
        id,
        createdAt,
        updatedAt: createdAt,
        createdByUserId: actor?.userId,
        updatedByUserId: actor?.userId,
      };
      state.availableTests.push(record);
      persistState();
      return record;
    },
    getAvailableTestById(id) {
      return state.availableTests.find((row) => row.id === id) || null;
    },
    listAvailableTestsByLabId(labId) {
      return state.availableTests
        .filter((row) => row.labId === labId && !row.archivedAt)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    },
    listBreederVisibleTests() {
      return state.availableTests
        .filter((row) => row.isActive && row.isVisibleToBreeder && !row.archivedAt)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    },
    updateAvailableTest(input, actor) {
      const current = state.availableTests.find((row) => row.id === input.id);
      if (!current) throw new Error("Available test not found.");
      if (input.name !== undefined) current.name = input.name;
      if (input.shortLabel !== undefined) current.shortLabel = input.shortLabel;
      if (input.description !== undefined) current.description = input.description;
      if (input.geneTarget !== undefined) current.geneTarget = input.geneTarget;
      if (input.category !== undefined) current.category = input.category;
      if (input.pricingType !== undefined) current.pricingType = input.pricingType;
      if (input.priceCents !== undefined) current.priceCents = input.priceCents;
      if (input.currency !== undefined) current.currency = input.currency;
      if (input.allowedPriorities !== undefined) current.allowedPriorities = input.allowedPriorities;
      if (input.sortOrder !== undefined) current.sortOrder = input.sortOrder;
      current.pricingType = inferPricingType(current.pricingType, current.category);
      current.updatedAt = nowIso();
      current.updatedByUserId = actor?.userId;
      persistState();
      return current;
    },
    setAvailableTestActive(id, isActive, actor) {
      const current = state.availableTests.find((row) => row.id === id) || null;
      if (!current) return null;
      current.isActive = isActive;
      current.updatedAt = nowIso();
      current.updatedByUserId = actor?.userId;
      persistState();
      return current;
    },
    setAvailableTestVisibility(id, isVisibleToBreeder, actor) {
      const current = state.availableTests.find((row) => row.id === id) || null;
      if (!current) return null;
      current.isVisibleToBreeder = isVisibleToBreeder;
      current.updatedAt = nowIso();
      current.updatedByUserId = actor?.userId;
      persistState();
      return current;
    },
    createPendingShedTest(input, actor) {
      const createdAt = nowIso();
      const record: PendingShedTestItem = {
        ...input,
        selectedTestNames: Array.isArray(input.selectedTestNames) ? input.selectedTestNames : [],
        createdAt,
        updatedAt: createdAt,
      };
      state.pendingShedTests.push(record);
      persistState();
      return record;
    },
    getPendingShedTestById(id) {
      return state.pendingShedTests.find((row) => row.id === id) || null;
    },
    updatePendingShedTest(id, patch) {
      const current = state.pendingShedTests.find((row) => row.id === id) || null;
      if (!current) return null;
      if (patch.selectedTestIds !== undefined) current.selectedTestIds = patch.selectedTestIds;
      if (patch.selectedTestNames !== undefined) current.selectedTestNames = patch.selectedTestNames;
      if (patch.priority !== undefined) current.priority = patch.priority;
      if (patch.sampleType !== undefined) current.sampleType = patch.sampleType;
      if (patch.notes !== undefined) current.notes = patch.notes;
      if (patch.selected !== undefined) current.selected = patch.selected;
      current.updatedAt = nowIso();
      persistState();
      return current;
    },
    deletePendingShedTest(id) {
      const before = state.pendingShedTests.length;
      state.pendingShedTests = state.pendingShedTests.filter((row) => row.id !== id);
      const deleted = state.pendingShedTests.length !== before;
      if (deleted) persistState();
      return deleted;
    },
    listPendingShedTestsByBreederUserId(breederUserId) {
      return state.pendingShedTests
        .filter((row) => row.breederUserId === breederUserId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    createShedSubmissionBatch(input) {
      const createdAt = nowIso();
      const record: ShedSubmissionBatch = {
        ...input,
        createdAt,
        updatedAt: createdAt,
      };
      state.shedSubmissionBatches.push(record);
      persistState();
      return record;
    },
    getShedSubmissionBatchById(id) {
      return state.shedSubmissionBatches.find((row) => row.id === id) || null;
    },
    listShedSubmissionBatchesByBreederUserId(breederUserId) {
      return state.shedSubmissionBatches
        .filter((row) => row.breederUserId === breederUserId)
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    },
    listByAnimal(animalId) {
      return {
        testOrders: state.testOrders.filter((row) => row.animalId === animalId),
        samples: state.samples.filter((row) => row.animalId === animalId),
        testResults: state.testResults.filter((row) => row.animalId === animalId),
        certificates: state.certificates.filter((row) => row.animalId === animalId),
        payments: state.payments.filter((row) => row.animalId === animalId),
        geneticsChanges: state.geneticsChanges.filter((row) => row.animalId === animalId),
      };
    },
  };
};

const createSqliteLabStore = (): LabStore => {
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  const DatabaseConstructor: any = (() => {
    try {
      return require("better-sqlite3");
    } catch {
      return null;
    }
  })();

  const DB_PATH = process.env.LAB_DB_PATH
    ? path.resolve(process.cwd(), process.env.LAB_DB_PATH)
    : path.resolve(process.cwd(), "data", "lab.sqlite");

  let database: any = null;

  const seedDefaultCatalogInSqlite = (db: any): void => {
    const defaults = buildDefaultCatalogRecords();
    const defaultsByCode = new Map(defaults.map((entry) => [normalizeCatalogLookupKey(entry.internalCode), entry]));
    const defaultsByName = new Map(defaults.map((entry) => [normalizeCatalogLookupKey(entry.name), entry]));
    const systemRows = db.prepare(
      `SELECT id, internal_code, name
       FROM available_tests
       WHERE lab_id = ? AND COALESCE(created_by_user_id, ?) = ?`
    ).all(DEFAULT_LAB_ID, SYSTEM_CATALOG_USER_ID, SYSTEM_CATALOG_USER_ID);
    const findExistingStmt = db.prepare(
      `SELECT id
       FROM available_tests
       WHERE lab_id = ?
         AND archived_at IS NULL
         AND (LOWER(internal_code) = LOWER(?) OR LOWER(name) = LOWER(?))
       LIMIT 1`
    );
    const updateCanonicalStmt = db.prepare(
      `UPDATE available_tests SET
        internal_code = ?,
        name = ?,
        short_label = ?,
        description = ?,
        gene_target = ?,
        category = ?,
        pricing_type = ?,
        currency = ?,
        archived_at = NULL,
        updated_by_user_id = ?,
        updated_at = ?
      WHERE id = ?`
    );
    const insertStmt = db.prepare(
      `INSERT INTO available_tests (
        id, lab_id, internal_code, name, short_label, description, gene_target, category,
        pricing_type, price_cents, currency, allowed_priorities_json, is_active, is_visible_to_breeder,
        sort_order, archived_at, created_by_user_id, updated_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const archiveStmt = db.prepare(
      `UPDATE available_tests
       SET archived_at = ?, updated_by_user_id = ?, updated_at = ?
       WHERE id = ? AND archived_at IS NULL`
    );

    for (const row of systemRows) {
      const matchingDefault =
        defaultsByCode.get(normalizeCatalogLookupKey(row.internal_code)) ||
        defaultsByName.get(normalizeCatalogLookupKey(row.name));
      if (matchingDefault) continue;
      const archivedAt = nowIso();
      archiveStmt.run(archivedAt, SYSTEM_CATALOG_USER_ID, archivedAt, row.id);
    }

    for (const entry of defaults) {
      const existing = findExistingStmt.get(DEFAULT_LAB_ID, entry.internalCode, entry.name);
      if (existing) {
        updateCanonicalStmt.run(
          entry.internalCode,
          entry.name,
          entry.shortLabel || null,
          entry.description || null,
          entry.geneTarget || null,
          entry.category || null,
          inferPricingType(entry.pricingType, entry.category),
          entry.currency,
          SYSTEM_CATALOG_USER_ID,
          nowIso(),
          existing.id
        );
        continue;
      }
      const createdAt = nowIso();
      insertStmt.run(
        makeId("avtest"),
        DEFAULT_LAB_ID,
        entry.internalCode,
        entry.name,
        entry.shortLabel || null,
        entry.description || null,
        entry.geneTarget || null,
        entry.category || null,
        entry.pricingType || "morph",
        entry.priceCents ?? null,
        entry.currency,
        safeStringify(entry.allowedPriorities || ["routine", "priority", "urgent"]),
        entry.isActive !== false ? 1 : 0,
        entry.isVisibleToBreeder !== false ? 1 : 0,
        entry.sortOrder ?? 0,
        entry.archivedAt || null,
        entry.createdByUserId || SYSTEM_CATALOG_USER_ID,
        entry.updatedByUserId || SYSTEM_CATALOG_USER_ID,
        createdAt,
        createdAt
      );
    }
  };

  const ensureDb = (): any => {
    if (database) return database;
    if (!DatabaseConstructor) {
      throw new Error("better-sqlite3 is required for lab persistence.");
    }
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    const db = new DatabaseConstructor(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.exec(sqlSchema);
    const columns = db.prepare("PRAGMA table_info(test_orders)").all();
    const hasPaymentStatus = Array.isArray(columns) && columns.some((col: any) => col?.name === "payment_status");
    if (!hasPaymentStatus) {
      db.exec("ALTER TABLE test_orders ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'pending'");
    }
    const hasPricingSnapshot = Array.isArray(columns) && columns.some((col: any) => col?.name === "pricing_snapshot_json");
    if (!hasPricingSnapshot) {
      db.exec("ALTER TABLE test_orders ADD COLUMN pricing_snapshot_json TEXT");
    }
    const availableTestsColumns = db.prepare("PRAGMA table_info(available_tests)").all();
    const hasPricingType = Array.isArray(availableTestsColumns) && availableTestsColumns.some((col: any) => col?.name === "pricing_type");
    if (!hasPricingType) {
      db.exec("ALTER TABLE available_tests ADD COLUMN pricing_type TEXT NOT NULL DEFAULT 'morph'");
      db.exec("UPDATE available_tests SET pricing_type = CASE WHEN LOWER(COALESCE(category, '')) LIKE '%sex%' THEN 'sex' ELSE 'morph' END");
    }
    seedDefaultCatalogInSqlite(db);
    database = db;
    return database;
  };

  const deriveOrderPaymentStatusFromWorkflow = (status: string): OrderPaymentStatus => {
    if (status === "paid") return "paid";
    return "pending";
  };

  const rowToTestOrder = (row: any): TestOrder => ({
    id: row.id,
    labId: row.lab_id,
    animalId: row.animal_id,
    orderNumber: row.order_number,
    status: row.status,
    requestedTests: safeParse<string[]>(row.requested_tests_json, []),
    pricingSnapshot: safeParse(row.pricing_snapshot_json, null) || undefined,
    priority: row.priority,
    breederUserId: row.breeder_user_id || undefined,
    requestedByUserId: row.requested_by_user_id || undefined,
    submittedAt: row.submitted_at || undefined,
    sampleIds: safeParse<string[]>(row.sample_ids_json, []),
    resultIds: safeParse<string[]>(row.result_ids_json, []),
    certificateId: row.certificate_id || undefined,
    paymentId: row.payment_id || undefined,
    paymentStatus: (row.payment_status || deriveOrderPaymentStatusFromWorkflow(row.status)) as OrderPaymentStatus,
    externalReference: row.external_reference || undefined,
    notes: row.notes || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  const rowToSample = (row: any): Sample => ({
    id: row.id,
    labId: row.lab_id,
    orderId: row.order_id,
    animalId: row.animal_id,
    status: row.status,
    type: row.type,
    accessionNumber: row.accession_number || undefined,
    collectedAt: row.collected_at || undefined,
    receivedAt: row.received_at || undefined,
    acceptedAt: row.accepted_at || undefined,
    rejectedAt: row.rejected_at || undefined,
    quality: row.quality || undefined,
    storageLocation: row.storage_location || undefined,
    trackingCode: row.tracking_code || undefined,
    qrToken: row.qr_token || "",
    collectorUserId: row.collector_user_id || undefined,
    rejectionReason: row.rejection_reason || undefined,
    notes: row.notes || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  const rowToTestResult = (row: any): TestResult => ({
    id: row.id,
    labId: row.lab_id,
    orderId: row.order_id,
    sampleId: row.sample_id,
    animalId: row.animal_id,
    status: row.status,
    testCode: row.test_code,
    method: row.method || undefined,
    findings: safeParse<TestResult["findings"]>(row.findings_json, []),
    summary: row.summary || undefined,
    reportedAt: row.reported_at || undefined,
    reviewedAt: row.reviewed_at || undefined,
    releasedAt: row.released_at || undefined,
    analystUserId: row.analyst_user_id || undefined,
    reviewerUserId: row.reviewer_user_id || undefined,
    certificateId: row.certificate_id || undefined,
    notes: row.notes || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  const rowToCertificate = (row: any): Certificate => ({
    id: row.id,
    labId: row.lab_id,
    orderId: row.order_id,
    animalId: row.animal_id,
    status: row.status,
    certificateNumber: row.certificate_number,
    resultIds: safeParse<string[]>(row.result_ids_json, []),
    issuedAt: row.issued_at || undefined,
    expiresAt: row.expires_at || undefined,
    fileUrl: row.file_url || undefined,
    signatureDigest: row.signature_digest || undefined,
    issuedByUserId: row.issued_by_user_id || undefined,
    notes: row.notes || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  const rowToPayment = (row: any): Payment => ({
    id: row.id,
    labId: row.lab_id,
    orderId: row.order_id,
    animalId: row.animal_id || undefined,
    status: row.status,
    amountCents: Number(row.amount_cents),
    currency: row.currency,
    method: row.method,
    provider: row.provider || undefined,
    externalTransactionId: row.external_transaction_id || undefined,
    paidAt: row.paid_at || undefined,
    failedAt: row.failed_at || undefined,
    refundedAt: row.refunded_at || undefined,
    notes: row.notes || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  const rowToStatusHistory = (row: any): StatusHistory => ({
    id: row.id,
    labId: row.lab_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    fromStatus: row.from_status || undefined,
    toStatus: row.to_status,
    changedAt: row.changed_at,
    changedByUserId: row.changed_by_user_id || undefined,
    reason: row.reason || undefined,
    notes: row.notes || undefined,
    metadata: safeParse<Record<string, unknown>>(row.metadata_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  const rowToGeneticsChange = (row: any): GeneticsChangeLog => ({
    id: row.id,
    labId: row.lab_id,
    animalId: row.animal_id,
    status: row.status,
    source: row.source,
    changeType: row.change_type,
    before: safeParse<GeneticsChangeLog["before"]>(row.before_json, { morphs: [], hets: [] }),
    after: safeParse<GeneticsChangeLog["after"]>(row.after_json, { morphs: [], hets: [] }),
    orderId: row.order_id || undefined,
    resultId: row.result_id || undefined,
    changedAt: row.changed_at,
    changedByUserId: row.changed_by_user_id || undefined,
    reviewerUserId: row.reviewer_user_id || undefined,
    reviewedAt: row.reviewed_at || undefined,
    reason: row.reason || undefined,
    notes: row.notes || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  const rowToAvailableTest = (row: any): LabAvailableTest => ({
    id: row.id,
    labId: row.lab_id,
    internalCode: row.internal_code,
    name: row.name,
    shortLabel: row.short_label || undefined,
    description: row.description || undefined,
    geneTarget: row.gene_target || undefined,
    category: row.category || undefined,
    pricingType: row.pricing_type === "sex" ? "sex" : (String(row.category || "").toLowerCase().includes("sex") ? "sex" : "morph"),
    priceCents: row.price_cents != null ? Number(row.price_cents) : undefined,
    currency: row.currency,
    allowedPriorities: safeParse<LabAvailableTest["allowedPriorities"]>(row.allowed_priorities_json, ["routine", "priority", "urgent"]),
    isActive: row.is_active !== 0,
    isVisibleToBreeder: row.is_visible_to_breeder !== 0,
    sortOrder: Number(row.sort_order ?? 0),
    archivedAt: row.archived_at || undefined,
    createdByUserId: row.created_by_user_id || undefined,
    updatedByUserId: row.updated_by_user_id || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  const rowToPendingShedTest = (row: any): PendingShedTestItem => ({
    id: row.id,
    breederUserId: row.breeder_user_id,
    labId: row.lab_id,
    snakeId: row.snake_id,
    snakeDisplayId: row.snake_display_id || undefined,
    snakeName: row.snake_name || undefined,
    selectedTestIds: safeParse<string[]>(row.selected_test_ids_json, []),
    selectedTestNames: safeParse<string[]>(row.selected_test_names_json, []),
    priority: row.priority,
    sampleType: row.sample_type,
    notes: row.notes || undefined,
    selected: row.selected !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  const rowToShedSubmissionBatch = (row: any): ShedSubmissionBatch => ({
    id: row.id,
    breederUserId: row.breeder_user_id,
    labId: row.lab_id,
    pendingItemIds: safeParse<string[]>(row.pending_item_ids_json, []),
    orderIds: safeParse<string[]>(row.order_ids_json, []),
    itemCount: Number(row.item_count || 0),
    totalCents: Number(row.total_cents || 0),
    currency: row.currency,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  const addStatusHistory = (input: StatusChangeInput): StatusHistory => {
    const db = ensureDb();
    const id = input.id || makeId("status");
    const createdAt = nowIso();
    const changedAt = input.changedAt || createdAt;
    db.prepare(
      `INSERT INTO status_history (
        id, lab_id, entity_type, entity_id, from_status, to_status, changed_at,
        changed_by_user_id, changed_by_role, reason, notes, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.labId,
      input.entityType,
      input.entityId,
      input.fromStatus || null,
      input.toStatus,
      changedAt,
      input.actor?.userId || null,
      input.actor?.role || null,
      input.reason || null,
      input.notes || null,
      safeStringify(input.metadata || null),
      createdAt,
      createdAt
    );

    const row = db.prepare("SELECT * FROM status_history WHERE id = ?").get(id);
    return rowToStatusHistory(row);
  };

  return {
    createTestOrder(input, actor) {
      const db = ensureDb();
      const createdAt = nowIso();
      db.prepare(
        `INSERT INTO test_orders (
          id, lab_id, animal_id, order_number, status, requested_tests_json, pricing_snapshot_json, priority,
          breeder_user_id, requested_by_user_id, submitted_at, sample_ids_json, result_ids_json,
          certificate_id, payment_id, payment_status, external_reference, notes, created_by_user_id,
          updated_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        input.id,
        input.labId,
        input.animalId,
        input.orderNumber,
        input.status,
        safeStringify(input.requestedTests || []),
        safeStringify(input.pricingSnapshot || null),
        input.priority,
        input.breederUserId || null,
        input.requestedByUserId || null,
        input.submittedAt || null,
        safeStringify(input.sampleIds || []),
        safeStringify(input.resultIds || []),
        input.certificateId || null,
        input.paymentId || null,
        input.paymentStatus || "pending",
        input.externalReference || null,
        input.notes || null,
        actor?.userId || null,
        actor?.userId || null,
        createdAt,
        createdAt
      );

      addStatusHistory({
        labId: input.labId,
        entityType: "testOrder",
        entityId: input.id,
        toStatus: input.status,
        reason: "order_created",
        actor,
      });

      const row = db.prepare("SELECT * FROM test_orders WHERE id = ?").get(input.id);
      return rowToTestOrder(row);
    },

    getTestOrderById(orderId) {
      const db = ensureDb();
      const row = db.prepare("SELECT * FROM test_orders WHERE id = ?").get(orderId);
      return row ? rowToTestOrder(row) : null;
    },

    listTestOrdersByBreederUserId(breederUserId) {
      const db = ensureDb();
      const rows = db
        .prepare(
          `SELECT * FROM test_orders
           WHERE requested_by_user_id = ? OR breeder_user_id = ?
           ORDER BY created_at DESC`
        )
        .all(breederUserId, breederUserId);
      return rows.map(rowToTestOrder);
    },

    listTestOrdersByLabId(labId) {
      const db = ensureDb();
      const rows = db.prepare("SELECT * FROM test_orders WHERE lab_id = ? ORDER BY created_at DESC").all(labId);
      return rows.map(rowToTestOrder);
    },
    listAllTestOrders() {
      const db = ensureDb();
      const rows = db.prepare("SELECT * FROM test_orders ORDER BY created_at DESC").all();
      return rows.map(rowToTestOrder);
    },

    updateTestOrderStatus(orderId, status, actor, reason) {
      const db = ensureDb();
      const current = db.prepare("SELECT * FROM test_orders WHERE id = ?").get(orderId);
      if (!current) return null;
      const updatedAt = nowIso();
      db.prepare("UPDATE test_orders SET status = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?").run(
        status,
        actor?.userId || null,
        updatedAt,
        orderId
      );
      addStatusHistory({
        labId: current.lab_id,
        entityType: "testOrder",
        entityId: orderId,
        fromStatus: current.status,
        toStatus: status,
        actor,
        reason,
      });
      const next = db.prepare("SELECT * FROM test_orders WHERE id = ?").get(orderId);
      return rowToTestOrder(next);
    },
    updateTestOrderPaymentStatus(orderId, paymentStatus, actor, reason) {
      const db = ensureDb();
      const current = db.prepare("SELECT * FROM test_orders WHERE id = ?").get(orderId);
      if (!current) return null;
      const updatedAt = nowIso();
      db.prepare("UPDATE test_orders SET payment_status = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?").run(
        paymentStatus,
        actor?.userId || null,
        updatedAt,
        orderId
      );
      addStatusHistory({
        labId: current.lab_id,
        entityType: "testOrder",
        entityId: orderId,
        fromStatus: current.status,
        toStatus: current.status,
        actor,
        reason: reason || "test_order_payment_updated",
        metadata: { paymentStatus },
      });
      const next = db.prepare("SELECT * FROM test_orders WHERE id = ?").get(orderId);
      return rowToTestOrder(next);
    },

    createSample(input, actor) {
      const db = ensureDb();
      const createdAt = nowIso();
      db.prepare(
        `INSERT INTO samples (
          id, lab_id, order_id, animal_id, status, type, accession_number, collected_at,
          received_at, accepted_at, rejected_at, quality, storage_location, tracking_code,
          qr_token, collector_user_id, rejection_reason, notes, created_by_user_id,
          updated_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        input.id,
        input.labId,
        input.orderId,
        input.animalId,
        input.status,
        input.type,
        input.accessionNumber || null,
        input.collectedAt || null,
        input.receivedAt || null,
        input.acceptedAt || null,
        input.rejectedAt || null,
        input.quality || null,
        input.storageLocation || null,
        input.trackingCode || null,
        input.qrToken || "",
        input.collectorUserId || null,
        input.rejectionReason || null,
        input.notes || null,
        actor?.userId || null,
        actor?.userId || null,
        createdAt,
        createdAt
      );

      addStatusHistory({
        labId: input.labId,
        entityType: "sample",
        entityId: input.id,
        toStatus: input.status,
        reason: "sample_created",
        actor,
      });

      const row = db.prepare("SELECT * FROM samples WHERE id = ?").get(input.id);
      return rowToSample(row);
    },

    getSampleById(sampleId) {
      const db = ensureDb();
      const row = db.prepare("SELECT * FROM samples WHERE id = ?").get(sampleId);
      return row ? rowToSample(row) : null;
    },

    lookupSampleByQrToken(qrToken) {
      const db = ensureDb();
      const row = db.prepare("SELECT * FROM samples WHERE qr_token = ?").get(qrToken);
      return row ? rowToSample(row) : null;
    },

    updateSampleStatus(sampleId, status, actor, reason) {
      const db = ensureDb();
      const current = db.prepare("SELECT * FROM samples WHERE id = ?").get(sampleId);
      if (!current) return null;
      const updatedAt = nowIso();
      db.prepare("UPDATE samples SET status = ?, received_at = CASE WHEN ? = 'sample_received' AND received_at IS NULL THEN ? ELSE received_at END, updated_by_user_id = ?, updated_at = ? WHERE id = ?").run(
        status,
        status,
        updatedAt,
        actor?.userId || null,
        updatedAt,
        sampleId
      );
      addStatusHistory({
        labId: current.lab_id,
        entityType: "sample",
        entityId: sampleId,
        fromStatus: current.status,
        toStatus: status,
        actor,
        reason,
      });
      const next = db.prepare("SELECT * FROM samples WHERE id = ?").get(sampleId);
      return rowToSample(next);
    },

    createTestResult(input, actor) {
      const db = ensureDb();
      const createdAt = nowIso();
      db.prepare(
        `INSERT INTO test_results (
          id, lab_id, order_id, sample_id, animal_id, status, test_code, method, findings_json,
          summary, reported_at, reviewed_at, released_at, analyst_user_id, reviewer_user_id,
          certificate_id, notes, created_by_user_id, updated_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        input.id,
        input.labId,
        input.orderId,
        input.sampleId,
        input.animalId,
        input.status,
        input.testCode,
        input.method || null,
        safeStringify(input.findings || []),
        input.summary || null,
        input.reportedAt || null,
        input.reviewedAt || null,
        input.releasedAt || null,
        input.analystUserId || null,
        input.reviewerUserId || null,
        input.certificateId || null,
        input.notes || null,
        actor?.userId || null,
        actor?.userId || null,
        createdAt,
        createdAt
      );

      const orderRow = db.prepare("SELECT result_ids_json FROM test_orders WHERE id = ?").get(input.orderId);
      if (orderRow) {
        const existingResultIds = safeParse<string[]>(orderRow.result_ids_json, []);
        if (!existingResultIds.includes(input.id)) {
          const updatedAt = nowIso();
          db.prepare("UPDATE test_orders SET result_ids_json = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?")
            .run(safeStringify([...existingResultIds, input.id]), actor?.userId || null, updatedAt, input.orderId);
        }
      }

      addStatusHistory({
        labId: input.labId,
        entityType: "testResult",
        entityId: input.id,
        toStatus: input.status,
        reason: "test_result_created",
        actor,
      });

      const row = db.prepare("SELECT * FROM test_results WHERE id = ?").get(input.id);
      return rowToTestResult(row);
    },

    listTestResultsByOrderId(orderId) {
      const db = ensureDb();
      const rows = db
        .prepare("SELECT * FROM test_results WHERE order_id = ? ORDER BY created_at DESC")
        .all(orderId);
      return rows.map(rowToTestResult);
    },
    updateTestResultCertificateId(resultId, certificateId, actor, reason) {
      const db = ensureDb();
      const current = db.prepare("SELECT * FROM test_results WHERE id = ?").get(resultId);
      if (!current) return null;
      const updatedAt = nowIso();
      db.prepare("UPDATE test_results SET certificate_id = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?").run(
        certificateId,
        actor?.userId || null,
        updatedAt,
        resultId
      );
      addStatusHistory({
        labId: current.lab_id,
        entityType: "testResult",
        entityId: resultId,
        fromStatus: current.status,
        toStatus: current.status,
        actor,
        reason: reason || "test_result_certificate_linked",
        metadata: { certificateId },
      });
      const next = db.prepare("SELECT * FROM test_results WHERE id = ?").get(resultId);
      return rowToTestResult(next);
    },

    createCertificate(input, actor) {
      const db = ensureDb();
      const createdAt = nowIso();
      db.prepare(
        `INSERT INTO certificates (
          id, lab_id, order_id, animal_id, status, certificate_number, result_ids_json,
          issued_at, expires_at, file_url, signature_digest, issued_by_user_id, notes,
          created_by_user_id, updated_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        input.id,
        input.labId,
        input.orderId,
        input.animalId,
        input.status,
        input.certificateNumber,
        safeStringify(input.resultIds || []),
        input.issuedAt || null,
        input.expiresAt || null,
        input.fileUrl || null,
        input.signatureDigest || null,
        input.issuedByUserId || null,
        input.notes || null,
        actor?.userId || null,
        actor?.userId || null,
        createdAt,
        createdAt
      );

      addStatusHistory({
        labId: input.labId,
        entityType: "certificate",
        entityId: input.id,
        toStatus: input.status,
        reason: "certificate_created",
        actor,
      });

      const row = db.prepare("SELECT * FROM certificates WHERE id = ?").get(input.id);
      return rowToCertificate(row);
    },
    getCertificateById(certificateId) {
      const db = ensureDb();
      const row = db.prepare("SELECT * FROM certificates WHERE id = ?").get(certificateId);
      return row ? rowToCertificate(row) : null;
    },
    listCertificatesByOrderId(orderId) {
      const db = ensureDb();
      const rows = db.prepare("SELECT * FROM certificates WHERE order_id = ? ORDER BY created_at DESC").all(orderId);
      return rows.map(rowToCertificate);
    },

    updateCertificateStatus(certificateId, status, actor, reason) {
      const db = ensureDb();
      const current = db.prepare("SELECT * FROM certificates WHERE id = ?").get(certificateId);
      if (!current) return null;
      const updatedAt = nowIso();
      db.prepare("UPDATE certificates SET status = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?").run(
        status,
        actor?.userId || null,
        updatedAt,
        certificateId
      );
      addStatusHistory({
        labId: current.lab_id,
        entityType: "certificate",
        entityId: certificateId,
        fromStatus: current.status,
        toStatus: status,
        actor,
        reason,
      });
      const next = db.prepare("SELECT * FROM certificates WHERE id = ?").get(certificateId);
      return rowToCertificate(next);
    },
    updateTestOrderCertificateId(orderId, certificateId, actor, reason) {
      const db = ensureDb();
      const current = db.prepare("SELECT * FROM test_orders WHERE id = ?").get(orderId);
      if (!current) return null;
      const updatedAt = nowIso();
      db.prepare("UPDATE test_orders SET certificate_id = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?").run(
        certificateId,
        actor?.userId || null,
        updatedAt,
        orderId
      );
      addStatusHistory({
        labId: current.lab_id,
        entityType: "testOrder",
        entityId: orderId,
        fromStatus: current.status,
        toStatus: current.status,
        actor,
        reason: reason || "test_order_certificate_linked",
        metadata: { certificateId },
      });
      const next = db.prepare("SELECT * FROM test_orders WHERE id = ?").get(orderId);
      return rowToTestOrder(next);
    },

    createPayment(input, actor) {
      const db = ensureDb();
      const createdAt = nowIso();
      db.prepare(
        `INSERT INTO payments (
          id, lab_id, order_id, animal_id, status, amount_cents, currency, method, provider,
          external_transaction_id, paid_at, failed_at, refunded_at, notes,
          created_by_user_id, updated_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        input.id,
        input.labId,
        input.orderId,
        input.animalId || null,
        input.status,
        input.amountCents,
        input.currency,
        input.method,
        input.provider || null,
        input.externalTransactionId || null,
        input.paidAt || null,
        input.failedAt || null,
        input.refundedAt || null,
        input.notes || null,
        actor?.userId || null,
        actor?.userId || null,
        createdAt,
        createdAt
      );

      addStatusHistory({
        labId: input.labId,
        entityType: "payment",
        entityId: input.id,
        toStatus: input.status,
        reason: "payment_created",
        actor,
      });

      const row = db.prepare("SELECT * FROM payments WHERE id = ?").get(input.id);
      return rowToPayment(row);
    },

    updatePaymentStatus(paymentId, status, actor, reason) {
      const db = ensureDb();
      const current = db.prepare("SELECT * FROM payments WHERE id = ?").get(paymentId);
      if (!current) return null;
      const updatedAt = nowIso();
      db.prepare("UPDATE payments SET status = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?").run(
        status,
        actor?.userId || null,
        updatedAt,
        paymentId
      );
      addStatusHistory({
        labId: current.lab_id,
        entityType: "payment",
        entityId: paymentId,
        fromStatus: current.status,
        toStatus: status,
        actor,
        reason,
      });
      const next = db.prepare("SELECT * FROM payments WHERE id = ?").get(paymentId);
      return rowToPayment(next);
    },

    createGeneticsChangeLog(input, actor) {
      const db = ensureDb();
      const createdAt = nowIso();
      db.prepare(
        `INSERT INTO genetics_change_log (
          id, lab_id, animal_id, status, source, change_type, before_json, after_json,
          order_id, result_id, changed_at, changed_by_user_id, reviewer_user_id, reviewed_at,
          reason, notes, created_by_user_id, updated_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        input.id,
        input.labId,
        input.animalId,
        input.status,
        input.source,
        input.changeType,
        safeStringify(input.before),
        safeStringify(input.after),
        input.orderId || null,
        input.resultId || null,
        input.changedAt,
        input.changedByUserId || actor?.userId || null,
        input.reviewerUserId || null,
        input.reviewedAt || null,
        input.reason || null,
        input.notes || null,
        actor?.userId || null,
        actor?.userId || null,
        createdAt,
        createdAt
      );

      addStatusHistory({
        labId: input.labId,
        entityType: "geneticsChangeLog",
        entityId: input.id,
        toStatus: input.status,
        reason: "genetics_change_logged",
        actor,
      });

      const row = db.prepare("SELECT * FROM genetics_change_log WHERE id = ?").get(input.id);
      return rowToGeneticsChange(row);
    },

    applyApprovedGeneticsChange(changeId, actor, reason) {
      const db = ensureDb();
      const current = db.prepare("SELECT * FROM genetics_change_log WHERE id = ?").get(changeId);
      if (!current) return null;
      if (current.status !== "approved") {
        throw new Error("Genetics change must be approved before apply.");
      }
      const updatedAt = nowIso();
      db.prepare(
        "UPDATE genetics_change_log SET status = ?, reviewed_at = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?"
      ).run("applied", updatedAt, actor?.userId || null, updatedAt, changeId);

      addStatusHistory({
        labId: current.lab_id,
        entityType: "geneticsChangeLog",
        entityId: changeId,
        fromStatus: current.status,
        toStatus: "applied",
        actor,
        reason: reason || "genetics_change_applied",
      });

      const next = db.prepare("SELECT * FROM genetics_change_log WHERE id = ?").get(changeId);
      return rowToGeneticsChange(next);
    },
    listGeneticsChangesByOrderId(orderId) {
      const db = ensureDb();
      const rows = db
        .prepare("SELECT * FROM genetics_change_log WHERE order_id = ? ORDER BY created_at DESC")
        .all(orderId);
      return rows.map(rowToGeneticsChange);
    },

    addStatusHistory,

    listStatusHistory(entityType, entityId) {
      const db = ensureDb();
      const rows = db
        .prepare("SELECT * FROM status_history WHERE entity_type = ? AND entity_id = ? ORDER BY changed_at ASC")
        .all(entityType, entityId);
      return rows.map(rowToStatusHistory);
    },

    createAvailableTest(input, actor) {
      const db = ensureDb();
      const id = makeId("avtest");
      const createdAt = nowIso();
      const pricingType = inferPricingType(input.pricingType, input.category);
      db.prepare(
        `INSERT INTO available_tests (
          id, lab_id, internal_code, name, short_label, description, gene_target, category,
          pricing_type, price_cents, currency, allowed_priorities_json, is_active, is_visible_to_breeder,
          sort_order, archived_at, created_by_user_id, updated_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id, input.labId, input.internalCode, input.name,
        input.shortLabel || null, input.description || null, input.geneTarget || null, input.category || null,
        pricingType,
        input.priceCents ?? null, input.currency,
        safeStringify(input.allowedPriorities || ["routine", "priority", "urgent"]),
        input.isActive !== false ? 1 : 0,
        input.isVisibleToBreeder !== false ? 1 : 0,
        input.sortOrder ?? 0,
        input.archivedAt || null,
        actor?.userId || null, actor?.userId || null,
        createdAt, createdAt
      );
      const row = db.prepare("SELECT * FROM available_tests WHERE id = ?").get(id);
      return rowToAvailableTest(row);
    },

    getAvailableTestById(id) {
      const db = ensureDb();
      const row = db.prepare("SELECT * FROM available_tests WHERE id = ?").get(id);
      return row ? rowToAvailableTest(row) : null;
    },

    listAvailableTestsByLabId(labId) {
      const db = ensureDb();
      const rows = db
        .prepare("SELECT * FROM available_tests WHERE lab_id = ? AND archived_at IS NULL ORDER BY sort_order ASC, name ASC")
        .all(labId);
      return rows.map(rowToAvailableTest);
    },

    listBreederVisibleTests() {
      const db = ensureDb();
      const rows = db
        .prepare("SELECT * FROM available_tests WHERE is_active = 1 AND is_visible_to_breeder = 1 AND archived_at IS NULL ORDER BY sort_order ASC, name ASC")
        .all();
      return rows.map(rowToAvailableTest);
    },

    updateAvailableTest(input, actor) {
      const db = ensureDb();
      const current = db.prepare("SELECT * FROM available_tests WHERE id = ?").get(input.id);
      if (!current) throw new Error("Available test not found.");
      const updatedAt = nowIso();
      const pricingType = inferPricingType(input.pricingType, input.category || current.category);
      db.prepare(
        `UPDATE available_tests SET
          name = COALESCE(?, name),
          short_label = COALESCE(?, short_label),
          description = COALESCE(?, description),
          gene_target = COALESCE(?, gene_target),
          category = COALESCE(?, category),
          pricing_type = COALESCE(?, pricing_type),
          price_cents = COALESCE(?, price_cents),
          currency = COALESCE(?, currency),
          allowed_priorities_json = COALESCE(?, allowed_priorities_json),
          sort_order = COALESCE(?, sort_order),
          updated_by_user_id = ?,
          updated_at = ?
        WHERE id = ?`
      ).run(
        input.name || null,
        input.shortLabel !== undefined ? (input.shortLabel || null) : null,
        input.description !== undefined ? (input.description || null) : null,
        input.geneTarget !== undefined ? (input.geneTarget || null) : null,
        input.category !== undefined ? (input.category || null) : null,
        pricingType,
        input.priceCents !== undefined ? input.priceCents : null,
        input.currency || null,
        input.allowedPriorities ? safeStringify(input.allowedPriorities) : null,
        input.sortOrder !== undefined ? input.sortOrder : null,
        actor?.userId || null,
        updatedAt,
        input.id
      );
      const row = db.prepare("SELECT * FROM available_tests WHERE id = ?").get(input.id);
      return rowToAvailableTest(row);
    },

    setAvailableTestActive(id, isActive, actor) {
      const db = ensureDb();
      const exists = db.prepare("SELECT id FROM available_tests WHERE id = ?").get(id);
      if (!exists) return null;
      const updatedAt = nowIso();
      db.prepare("UPDATE available_tests SET is_active = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?").run(
        isActive ? 1 : 0, actor?.userId || null, updatedAt, id
      );
      const row = db.prepare("SELECT * FROM available_tests WHERE id = ?").get(id);
      return rowToAvailableTest(row);
    },

    setAvailableTestVisibility(id, isVisibleToBreeder, actor) {
      const db = ensureDb();
      const exists = db.prepare("SELECT id FROM available_tests WHERE id = ?").get(id);
      if (!exists) return null;
      const updatedAt = nowIso();
      db.prepare("UPDATE available_tests SET is_visible_to_breeder = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?").run(
        isVisibleToBreeder ? 1 : 0, actor?.userId || null, updatedAt, id
      );
      const row = db.prepare("SELECT * FROM available_tests WHERE id = ?").get(id);
      return rowToAvailableTest(row);
    },

    createPendingShedTest(input, actor) {
      const db = ensureDb();
      const createdAt = nowIso();
      db.prepare(
        `INSERT INTO pending_shed_tests (
          id, breeder_user_id, lab_id, snake_id, snake_display_id, snake_name,
          selected_test_ids_json, selected_test_names_json, priority, sample_type,
          notes, selected, created_by_user_id, updated_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        input.id,
        input.breederUserId,
        input.labId,
        input.snakeId,
        input.snakeDisplayId || null,
        input.snakeName || null,
        safeStringify(input.selectedTestIds || []),
        safeStringify(input.selectedTestNames || []),
        input.priority,
        input.sampleType,
        input.notes || null,
        input.selected !== false ? 1 : 0,
        actor?.userId || null,
        actor?.userId || null,
        createdAt,
        createdAt
      );
      const row = db.prepare("SELECT * FROM pending_shed_tests WHERE id = ?").get(input.id);
      return rowToPendingShedTest(row);
    },

    getPendingShedTestById(id) {
      const db = ensureDb();
      const row = db.prepare("SELECT * FROM pending_shed_tests WHERE id = ?").get(id);
      return row ? rowToPendingShedTest(row) : null;
    },

    updatePendingShedTest(id, patch, actor) {
      const db = ensureDb();
      const current = db.prepare("SELECT * FROM pending_shed_tests WHERE id = ?").get(id);
      if (!current) return null;
      const updatedAt = nowIso();
      db.prepare(
        `UPDATE pending_shed_tests SET
          selected_test_ids_json = COALESCE(?, selected_test_ids_json),
          selected_test_names_json = COALESCE(?, selected_test_names_json),
          priority = COALESCE(?, priority),
          sample_type = COALESCE(?, sample_type),
          notes = COALESCE(?, notes),
          selected = COALESCE(?, selected),
          updated_by_user_id = ?,
          updated_at = ?
        WHERE id = ?`
      ).run(
        patch.selectedTestIds ? safeStringify(patch.selectedTestIds) : null,
        patch.selectedTestNames ? safeStringify(patch.selectedTestNames) : null,
        patch.priority || null,
        patch.sampleType || null,
        patch.notes !== undefined ? (patch.notes || null) : null,
        patch.selected !== undefined ? (patch.selected ? 1 : 0) : null,
        actor?.userId || null,
        updatedAt,
        id
      );
      const row = db.prepare("SELECT * FROM pending_shed_tests WHERE id = ?").get(id);
      return rowToPendingShedTest(row);
    },

    deletePendingShedTest(id) {
      const db = ensureDb();
      const res = db.prepare("DELETE FROM pending_shed_tests WHERE id = ?").run(id);
      return Number(res?.changes || 0) > 0;
    },

    listPendingShedTestsByBreederUserId(breederUserId) {
      const db = ensureDb();
      const rows = db
        .prepare("SELECT * FROM pending_shed_tests WHERE breeder_user_id = ? ORDER BY updated_at DESC")
        .all(breederUserId);
      return rows.map(rowToPendingShedTest);
    },

    createShedSubmissionBatch(input, actor) {
      const db = ensureDb();
      const createdAt = nowIso();
      db.prepare(
        `INSERT INTO shed_submission_batches (
          id, breeder_user_id, lab_id, pending_item_ids_json, order_ids_json,
          item_count, total_cents, currency, submitted_at,
          created_by_user_id, updated_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        input.id,
        input.breederUserId,
        input.labId,
        safeStringify(input.pendingItemIds || []),
        safeStringify(input.orderIds || []),
        input.itemCount,
        input.totalCents,
        input.currency,
        input.submittedAt,
        actor?.userId || null,
        actor?.userId || null,
        createdAt,
        createdAt
      );
      const row = db.prepare("SELECT * FROM shed_submission_batches WHERE id = ?").get(input.id);
      return rowToShedSubmissionBatch(row);
    },

    getShedSubmissionBatchById(id) {
      const db = ensureDb();
      const row = db.prepare("SELECT * FROM shed_submission_batches WHERE id = ?").get(id);
      return row ? rowToShedSubmissionBatch(row) : null;
    },

    listShedSubmissionBatchesByBreederUserId(breederUserId) {
      const db = ensureDb();
      const rows = db
        .prepare("SELECT * FROM shed_submission_batches WHERE breeder_user_id = ? ORDER BY submitted_at DESC")
        .all(breederUserId);
      return rows.map(rowToShedSubmissionBatch);
    },

    listByAnimal(animalId) {
      const db = ensureDb();
      return {
        testOrders: db.prepare("SELECT * FROM test_orders WHERE animal_id = ? ORDER BY created_at DESC").all(animalId).map(rowToTestOrder),
        samples: db.prepare("SELECT * FROM samples WHERE animal_id = ? ORDER BY created_at DESC").all(animalId).map(rowToSample),
        testResults: db.prepare("SELECT * FROM test_results WHERE animal_id = ? ORDER BY created_at DESC").all(animalId).map(rowToTestResult),
        certificates: db.prepare("SELECT * FROM certificates WHERE animal_id = ? ORDER BY created_at DESC").all(animalId).map(rowToCertificate),
        payments: db.prepare("SELECT * FROM payments WHERE animal_id = ? ORDER BY created_at DESC").all(animalId).map(rowToPayment),
        geneticsChanges: db.prepare("SELECT * FROM genetics_change_log WHERE animal_id = ? ORDER BY created_at DESC").all(animalId).map(rowToGeneticsChange),
      };
    },
  };
};

const store: LabStore = isBrowser ? createMemoryLabStore() : createSqliteLabStore();

export const createTestOrderRecord = (input: CreateTestOrderInput, actor?: ActorContext): TestOrder =>
  store.createTestOrder(input, actor);

export const updateTestOrderStatusRecord = (
  orderId: string,
  status: TestOrderStatus,
  actor?: ActorContext,
  reason?: string
): TestOrder | null => store.updateTestOrderStatus(orderId, status, actor, reason);

export const updateTestOrderPaymentStatusRecord = (
  orderId: string,
  paymentStatus: OrderPaymentStatus,
  actor?: ActorContext,
  reason?: string
): TestOrder | null => store.updateTestOrderPaymentStatus(orderId, paymentStatus, actor, reason);

export const getTestOrderRecordById = (orderId: string): TestOrder | null =>
  store.getTestOrderById(orderId);

export const listTestOrderRecordsByBreederUserId = (breederUserId: string): TestOrder[] =>
  store.listTestOrdersByBreederUserId(breederUserId);

export const listTestOrderRecordsByLabId = (labId: string): TestOrder[] =>
  store.listTestOrdersByLabId(labId);

export const listAllTestOrderRecords = (): TestOrder[] =>
  store.listAllTestOrders();

export const createSampleRecord = (input: CreateSampleInput, actor?: ActorContext): Sample =>
  store.createSample(input, actor);

export const getSampleRecordById = (sampleId: string): Sample | null =>
  store.getSampleById(sampleId);

export const lookupSampleByQrTokenRecord = (qrToken: string): Sample | null =>
  store.lookupSampleByQrToken(qrToken);

export const updateSampleStatusRecord = (
  sampleId: string,
  status: SampleStatus,
  actor?: ActorContext,
  reason?: string
): Sample | null => store.updateSampleStatus(sampleId, status, actor, reason);

export const createTestResultRecord = (input: CreateTestResultInput, actor?: ActorContext): TestResult =>
  store.createTestResult(input, actor);

export const listTestResultRecordsByOrderId = (orderId: string): TestResult[] =>
  store.listTestResultsByOrderId(orderId);

export const updateTestResultCertificateIdRecord = (
  resultId: string,
  certificateId: string,
  actor?: ActorContext,
  reason?: string
): TestResult | null => store.updateTestResultCertificateId(resultId, certificateId, actor, reason);

export const createCertificateRecord = (input: CreateCertificateInput, actor?: ActorContext): Certificate =>
  store.createCertificate(input, actor);

export const getCertificateRecordById = (certificateId: string): Certificate | null =>
  store.getCertificateById(certificateId);

export const listCertificateRecordsByOrderId = (orderId: string): Certificate[] =>
  store.listCertificatesByOrderId(orderId);

export const updateCertificateStatusRecord = (
  certificateId: string,
  status: CertificateStatus,
  actor?: ActorContext,
  reason?: string
): Certificate | null => store.updateCertificateStatus(certificateId, status, actor, reason);

export const updateTestOrderCertificateIdRecord = (
  orderId: string,
  certificateId: string,
  actor?: ActorContext,
  reason?: string
): TestOrder | null => store.updateTestOrderCertificateId(orderId, certificateId, actor, reason);

export const createPaymentRecord = (input: CreatePaymentInput, actor?: ActorContext): Payment =>
  store.createPayment(input, actor);

export const updatePaymentStatusRecord = (
  paymentId: string,
  status: PaymentStatus,
  actor?: ActorContext,
  reason?: string
): Payment | null => store.updatePaymentStatus(paymentId, status, actor, reason);

export const createGeneticsChangeLogRecord = (
  input: CreateGeneticsChangeInput,
  actor?: ActorContext
): GeneticsChangeLog => store.createGeneticsChangeLog(input, actor);

export const applyApprovedGeneticsChangeRecord = (
  changeId: string,
  actor?: ActorContext,
  reason?: string
): GeneticsChangeLog | null => store.applyApprovedGeneticsChange(changeId, actor, reason);

export const listGeneticsChangeRecordsByOrderId = (orderId: string): GeneticsChangeLog[] =>
  store.listGeneticsChangesByOrderId(orderId);

export const addStatusHistoryRecord = (input: StatusChangeInput): StatusHistory => store.addStatusHistory(input);

export const listStatusHistoryRecords = (
  entityType: StatusHistory["entityType"],
  entityId: string
): StatusHistory[] => store.listStatusHistory(entityType, entityId);

export const listLabRecordsByAnimal = (animalId: string) => store.listByAnimal(animalId);

export const createAvailableTestRecord = (
  input: CreateAvailableTestStoreInput,
  actor?: ActorContext
): LabAvailableTest => store.createAvailableTest(input, actor);

export const getAvailableTestRecordById = (id: string): LabAvailableTest | null =>
  store.getAvailableTestById(id);

export const listAvailableTestRecordsByLabId = (labId: string): LabAvailableTest[] =>
  store.listAvailableTestsByLabId(labId);

export const listBreederVisibleTestRecords = (): LabAvailableTest[] =>
  store.listBreederVisibleTests();

export const updateAvailableTestRecord = (
  input: UpdateLabAvailableTestInput,
  actor?: ActorContext
): LabAvailableTest => store.updateAvailableTest(input, actor);

export const setAvailableTestActiveRecord = (
  id: string,
  isActive: boolean,
  actor?: ActorContext
): LabAvailableTest | null => store.setAvailableTestActive(id, isActive, actor);

export const setAvailableTestVisibilityRecord = (
  id: string,
  isVisibleToBreeder: boolean,
  actor?: ActorContext
): LabAvailableTest | null => store.setAvailableTestVisibility(id, isVisibleToBreeder, actor);

export const createPendingShedTestRecord = (
  input: CreatePendingShedTestStoreInput,
  actor?: ActorContext
): PendingShedTestItem => store.createPendingShedTest(input, actor);

export const getPendingShedTestRecordById = (id: string): PendingShedTestItem | null =>
  store.getPendingShedTestById(id);

export const updatePendingShedTestRecord = (
  id: string,
  patch: Partial<Pick<PendingShedTestItem, "selectedTestIds" | "selectedTestNames" | "priority" | "sampleType" | "notes" | "selected">>,
  actor?: ActorContext
): PendingShedTestItem | null => store.updatePendingShedTest(id, patch, actor);

export const deletePendingShedTestRecord = (id: string, actor?: ActorContext): boolean =>
  store.deletePendingShedTest(id, actor);

export const listPendingShedTestRecordsByBreederUserId = (breederUserId: string): PendingShedTestItem[] =>
  store.listPendingShedTestsByBreederUserId(breederUserId);

export const createShedSubmissionBatchRecord = (
  input: CreateShedSubmissionBatchStoreInput,
  actor?: ActorContext
): ShedSubmissionBatch => store.createShedSubmissionBatch(input, actor);

export const getShedSubmissionBatchRecordById = (id: string): ShedSubmissionBatch | null =>
  store.getShedSubmissionBatchById(id);

export const listShedSubmissionBatchRecordsByBreederUserId = (breederUserId: string): ShedSubmissionBatch[] =>
  store.listShedSubmissionBatchesByBreederUserId(breederUserId);

export const LAB_SCHEMA_SQL = sqlSchema;
