export type IsoDateString = string;
export type CurrencyCode = string;

import type {
  CertificateStatus,
  OrderPaymentStatus,
  PaymentStatus,
  SampleStatus,
  TestOrderStatus,
} from "./labStatus";
import type { PricingSnapshot } from "./labPricing";

export type LabId = string;
export type AnimalId = string;
export type UserId = string;

export interface AuditedEntity {
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

export type LabEntityType =
  | "testOrder"
  | "sample"
  | "testResult"
  | "certificate"
  | "payment"
  | "geneticsChangeLog";

export type TestResultStatus =
  | "pending"
  | "running"
  | "completed"
  | "reviewed"
  | "released"
  | "amended"
  | "cancelled";

export type GeneticsChangeLogStatus =
  | "pendingReview"
  | "approved"
  | "rejected"
  | "applied";

export interface StatusHistory extends AuditedEntity {
  id: string;
  labId: LabId;
  entityType: LabEntityType;
  entityId: string;
  fromStatus?: string;
  toStatus: string;
  changedAt: IsoDateString;
  changedByUserId?: UserId;
  reason?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export type TestPriority = "routine" | "priority" | "urgent";

export interface TestOrder extends AuditedEntity {
  id: string;
  labId: LabId;
  animalId: AnimalId;
  orderNumber: string;
  status: TestOrderStatus;
  requestedTests: string[];
  priority: TestPriority;
  breederUserId?: UserId;
  requestedByUserId?: UserId;
  submittedAt?: IsoDateString;
  sampleIds: string[];
  resultIds: string[];
  certificateId?: string;
  paymentId?: string;
  paymentStatus?: OrderPaymentStatus;
  pricingSnapshot?: PricingSnapshot;
  externalReference?: string;
  notes?: string;
}

export type SampleType = "shed" | "bellyScaleClip";

export type SampleQuality = "acceptable" | "borderline" | "degraded" | "insufficient";

export interface Sample extends AuditedEntity {
  id: string;
  labId: LabId;
  orderId: string;
  animalId: AnimalId;
  status: SampleStatus;
  type: SampleType;
  accessionNumber?: string;
  collectedAt?: IsoDateString;
  receivedAt?: IsoDateString;
  acceptedAt?: IsoDateString;
  rejectedAt?: IsoDateString;
  quality?: SampleQuality;
  storageLocation?: string;
  trackingCode?: string;
  /** Secure opaque token embedded in the sample's QR label. 64 hex chars (256-bit entropy). */
  qrToken: string;
  collectorUserId?: UserId;
  rejectionReason?: string;
  notes?: string;
}

export type TestOutcome =
  | "positive"
  | "negative"
  | "inconclusive"
  | "carrierDetected"
  | "notDetected";

export interface ResultFinding {
  marker: string;
  outcome: TestOutcome;
  orderedTestKey?: string;
  sourceOrderedName?: string;
  catalogTestId?: string;
  confidence?: number;
  value?: string;
  units?: string;
  notes?: string;
}

export interface TestResult extends AuditedEntity {
  id: string;
  labId: LabId;
  orderId: string;
  sampleId: string;
  animalId: AnimalId;
  status: TestResultStatus;
  testCode: string;
  method?: string;
  findings: ResultFinding[];
  summary?: string;
  reportedAt?: IsoDateString;
  reviewedAt?: IsoDateString;
  releasedAt?: IsoDateString;
  analystUserId?: UserId;
  reviewerUserId?: UserId;
  certificateId?: string;
  notes?: string;
}

export interface Certificate extends AuditedEntity {
  id: string;
  labId: LabId;
  orderId: string;
  animalId: AnimalId;
  status: CertificateStatus;
  certificateNumber: string;
  resultIds: string[];
  issuedAt?: IsoDateString;
  expiresAt?: IsoDateString;
  fileUrl?: string;
  signatureDigest?: string;
  issuedByUserId?: UserId;
  notes?: string;
}

export type PaymentMethod =
  | "cash"
  | "bankTransfer"
  | "card"
  | "mobile"
  | "manual"
  | "other";

export interface Payment extends AuditedEntity {
  id: string;
  labId: LabId;
  orderId: string;
  animalId?: AnimalId;
  status: PaymentStatus;
  amountCents: number;
  currency: CurrencyCode;
  method: PaymentMethod;
  provider?: string;
  externalTransactionId?: string;
  paidAt?: IsoDateString;
  failedAt?: IsoDateString;
  refundedAt?: IsoDateString;
  notes?: string;
}

export type GeneticsChangeSource = "labResult" | "manual" | "import" | "system";

export type GeneticsChangeType =
  | "addMorph"
  | "removeMorph"
  | "addHet"
  | "removeHet"
  | "addPossibleHet"
  | "removePossibleHet"
  | "normalizeAlias"
  | "replaceGeneticsSnapshot";

export interface GeneticsSnapshot {
  morphs: string[];
  hets: string[];
  possibleHets?: string[];
}

export interface GeneticsChangeLog extends AuditedEntity {
  id: string;
  labId: LabId;
  animalId: AnimalId;
  status: GeneticsChangeLogStatus;
  source: GeneticsChangeSource;
  changeType: GeneticsChangeType;
  before: GeneticsSnapshot;
  after: GeneticsSnapshot;
  orderId?: string;
  resultId?: string;
  changedAt: IsoDateString;
  changedByUserId?: UserId;
  reviewerUserId?: UserId;
  reviewedAt?: IsoDateString;
  reason?: string;
  notes?: string;
}
